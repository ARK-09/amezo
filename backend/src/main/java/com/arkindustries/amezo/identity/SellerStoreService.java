package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.common.exception.PayloadTooLargeException;
import com.arkindustries.amezo.common.exception.StorageUnavailableException;
import com.arkindustries.amezo.common.exception.UnprocessableEntityException;
import com.arkindustries.amezo.common.json.PatchField;
import com.arkindustries.amezo.identity.api.CurrentSeller;
import com.arkindustries.amezo.identity.dto.StoreImageConfirmRequest;
import com.arkindustries.amezo.identity.dto.StoreImageUploadUrlRequest;
import com.arkindustries.amezo.identity.dto.StoreImageUploadUrlResponse;
import com.arkindustries.amezo.identity.dto.StoreProfileResponse;
import com.arkindustries.amezo.identity.dto.UpdateStoreProfileRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * The seller's own storefront profile: GET and PATCH
 * /api/v1/sellers/me/store, plus the two store-image routes
 * (POST .../store/images and .../store/images/confirm).
 *
 * One service for all four because they are one entity and one set of rules -
 * the read is what every write returns, and the image flow's whole purpose is to
 * put a URL into two columns of this row. It is also the shape
 * SellerProductService already has: product CRUD and the product-image
 * presign/confirm live in one class there for exactly the same reason.
 *
 * No method takes a seller id. The routes are under /api/v1/sellers/me/**, which
 * SecurityConfig scopes to hasRole("SELLER"), so the subject is whoever the
 * session cookie names and there is no id to get wrong: cross-seller isolation is
 * a property of the query, not of a check that could be forgotten.
 */
@Service
public class SellerStoreService {

    private static final Logger log = LoggerFactory.getLogger(SellerStoreService.class);

    /**
     * Two, not one. The first retry covers the ordinary race - another request
     * created this seller's store between the read and the insert - which the
     * re-read below resolves. The second covers the rarer case where the
     * collision was on the HANDLE rather than on seller_id (two sellers whose
     * default names slug the same, provisioning at the same moment): re-reading
     * finds nothing, and the next attempt recomputes the handle against a
     * database that now contains the winner's.
     */
    private static final int PROVISION_ATTEMPTS = 2;

    /** Same window catalog's product images use. */
    private static final Duration UPLOAD_URL_TTL = Duration.ofMinutes(15);

    /**
     * The drop-zone's hint says "up to 5 MB" and
     * frontend/src/features/store-settings/branding.ts enforces exactly
     * 5 * 1024 * 1024 before a file leaves the browser. This is the same number,
     * so the server agrees with the printed promise instead of quietly allowing
     * more.
     *
     * A constant rather than a setting, unlike app.s3.max-upload-bytes: this one
     * is written on the page, which makes it part of the design rather than an
     * environment's choice. The deployment-wide TOTAL cap is not re-checked here
     * because a store holds at most two of these by construction - there is no
     * seller-driven multiplier the way there is for products x 7 images.
     */
    static final long MAX_STORE_IMAGE_BYTES = 5L * 1024 * 1024;

    private final SellerStoreRepository stores;
    private final SellerStoreImageRepository storeImages;
    private final SellerStoreProvisioner provisioner;
    private final CurrentSeller currentSeller;
    private final StoreImageUrls imageUrls;
    private final S3Presigner s3Presigner;
    private final S3Client s3Client;
    private final String s3Bucket;

    SellerStoreService(
            SellerStoreRepository stores,
            SellerStoreImageRepository storeImages,
            SellerStoreProvisioner provisioner,
            CurrentSeller currentSeller,
            StoreImageUrls imageUrls,
            S3Presigner s3Presigner,
            S3Client s3Client,
            @Value("${app.s3.bucket}") String s3Bucket) {
        this.stores = stores;
        this.storeImages = storeImages;
        this.provisioner = provisioner;
        this.currentSeller = currentSeller;
        this.imageUrls = imageUrls;
        this.s3Presigner = s3Presigner;
        this.s3Client = s3Client;
        this.s3Bucket = s3Bucket;
    }

    /**
     * Deliberately not @Transactional. The read is a single query, and the
     * provisioning path underneath it runs in the provisioner's own transaction
     * - wrapping both in a read-only one here would only add a transaction for
     * the inner write to suspend.
     */
    public StoreProfileResponse getMine() {
        return toResponse(requireStore(currentSeller.sellerId()));
    }

    @Transactional
    public StoreProfileResponse updateMine(UpdateStoreProfileRequest request) {
        SellerStore store = requireStore(currentSeller.sellerId());

        // Every plain field: null means the seller did not touch it. See
        // UpdateStoreProfileRequest for why blank is a different answer.
        if (request.name() != null) {
            store.setName(request.name().trim());
        }
        if (request.handle() != null) {
            store.setHandle(requireHandleFree(request.handle(), store.getId()));
        }
        if (request.tagline() != null) {
            store.setTagline(clearedIfBlank(request.tagline()));
        }
        if (request.location() != null) {
            store.setLocation(clearedIfBlank(request.location()));
        }
        // PatchField, so an explicit null clears the year rather than reading as
        // "unchanged" - see UpdateStoreProfileRequest.
        applyIfPresent(request.foundedYear(), store::setFoundedYear);
        if (request.supportEmail() != null) {
            store.setSupportEmail(clearedIfBlank(request.supportEmail()));
        }
        if (request.about() != null) {
            store.setAbout(clearedIfBlank(request.about()));
        }
        // Clearing a URL also releases the object behind it, or "Remove cover"
        // would leave a paid-for object in the bucket that nothing can ever
        // reach again.
        applyIfPresent(request.coverUrl(), url -> setImageUrl(store, StoreImageSlot.COVER, clearedIfBlank(url)));
        applyIfPresent(request.logoUrl(), url -> setImageUrl(store, StoreImageSlot.LOGO, clearedIfBlank(url)));
        if (request.status() != null) {
            store.setStatus(request.status());
        }
        if (request.vacationNote() != null) {
            store.setVacationNote(clearedIfBlank(request.vacationNote()));
        }

        // saveAndFlush, and the response is mapped from what it RETURNS, not
        // from the instance above. Two separate traps, both of which show up as
        // a correct row behind a stale response body:
        //   - @UpdateTimestamp assigns updated_at during the flush, so without
        //     an explicit one the response carries the pre-write timestamp and
        //     the form that just saved shows the old "last updated";
        //   - when the store was provisioned moments ago in the provisioner's
        //     own transaction, this instance is detached, so save() merges and
        //     the timestamp lands on the merged copy, not on this one.
        return toResponse(stores.saveAndFlush(store));
    }

    // --------------------------------------------------------- store images

    /**
     * Reserve a slot for the storefront's cover or logo and hand back a
     * presigned PUT for it. Step one of three; nothing is visible on the
     * storefront until confirmStoreImage runs.
     *
     * Transactional so the reserved row and the URL it reserves for live or die
     * together: the row is written before presigning because its id is what the
     * confirm step quotes, and without a rollback a failed presign would leave a
     * PENDING row behind for an upload that can never happen.
     */
    @Transactional
    public StoreImageUploadUrlResponse createImageUploadUrl(StoreImageUploadUrlRequest request) {
        SellerStore store = requireStore(currentSeller.sellerId());
        long sizeBytes = request.fileSizeBytes();
        if (sizeBytes > MAX_STORE_IMAGE_BYTES) {
            throw new PayloadTooLargeException("%s is %s, over the %s limit for a store %s image"
                    .formatted(
                            request.slot() == StoreImageSlot.COVER ? "Cover" : "Logo",
                            humanBytes(sizeBytes),
                            humanBytes(MAX_STORE_IMAGE_BYTES),
                            request.slot().name().toLowerCase()));
        }

        // A seller who picks three files in a row before any confirm lands leaves
        // two dead reservations behind. They are dropped here rather than left to
        // accumulate: only the newest reservation for a slot can still be
        // confirmed, so the older ones are rows and objects nobody will claim.
        discardPendingReservations(store.getId(), request.slot());

        SellerStoreImage reserved = storeImages.save(SellerStoreImage.builder()
                .sellerStoreId(store.getId())
                .slot(request.slot())
                .s3Key("stores/" + store.getId() + "/"
                        + request.slot().name().toLowerCase() + "/" + UUID.randomUUID())
                .status(StoreImageStatus.PENDING)
                .sizeBytes(sizeBytes)
                .build());

        PutObjectRequest putObject = PutObjectRequest.builder()
                .bucket(s3Bucket)
                .key(reserved.getS3Key())
                // Signing the length is what makes the declared size binding
                // rather than a claim: Content-Length is part of the signature,
                // so a client that presigns for 1 MB and then PUTs 5 GB gets a
                // 403 from the bucket, not a surprise line on the storage bill.
                .contentLength(sizeBytes)
                .contentType(request.contentType())
                .build();

        PresignedPutObjectRequest presigned;
        try {
            presigned = s3Presigner.presignPutObject(PutObjectPresignRequest.builder()
                    .signatureDuration(UPLOAD_URL_TTL)
                    .putObjectRequest(putObject)
                    .build());
        } catch (SdkException ex) {
            // Overwhelmingly this is "no credentials in the chain" on a
            // deployment that skipped the object-storage vars, which everything
            // except image upload runs fine without. A 503 naming that beats a
            // 500 whose only clue is a stack trace the seller cannot see.
            throw new StorageUnavailableException(
                    "Store image upload isn't configured on this deployment: object storage rejected "
                            + "the request to sign an upload URL. See backend/.env.example (AWS_*/S3_* vars).", ex);
        }

        return new StoreImageUploadUrlResponse(
                reserved.getId(),
                presigned.url().toString(),
                Instant.now().plus(UPLOAD_URL_TTL));
    }

    /**
     * Step three: verify the bytes really arrived, then put the URL on the
     * profile. Answers the whole updated profile, so the Branding section does
     * not have to re-read the store to learn where its new cover lives.
     */
    @Transactional
    public StoreProfileResponse confirmImage(StoreImageConfirmRequest request) {
        SellerStore store = requireStore(currentSeller.sellerId());

        // Scoped by store id in the query, not checked afterwards: a confirm
        // naming another seller's reservation is simply not found.
        SellerStoreImage reserved = storeImages
                .findByIdAndSellerStoreId(request.id(), store.getId())
                .orElseThrow(() -> new ConflictException(
                        URI.create("https://api/errors/upload-not-found"),
                        "Upload not found",
                        "No reserved store image " + request.id() + " belongs to this store.",
                        List.of()));

        if (reserved.getSlot() != request.slot()) {
            // 422 with the field named, so the caller learns WHICH half of the
            // pair it got wrong rather than a bare "bad request".
            throw new UnprocessableEntityException(
                    URI.create("https://api/errors/validation-error"),
                    "Validation failed",
                    "Store image " + reserved.getId() + " was reserved for the "
                            + reserved.getSlot().name().toLowerCase() + " slot.",
                    List.of(new UnprocessableEntityException.FieldError(
                            "slot", "does not match the reserved slot")));
        }

        if (reserved.getStatus() != StoreImageStatus.PENDING) {
            throw new ConflictException(
                    URI.create("https://api/errors/already-confirmed"),
                    "Already confirmed",
                    "Store image " + reserved.getId() + " was already confirmed.",
                    List.of());
        }

        // Verified against the bucket rather than taken on trust: confirm is a
        // client call, and a STORED row with no object behind it renders as a
        // broken image at the top of the storefront for good. The head also
        // carries the object's real size, which replaces the size the client
        // declared at presign time.
        HeadObjectResponse head = headStoredObject(reserved);
        reserved.setStatus(StoreImageStatus.STORED);
        reserved.setSizeBytes(head.contentLength());
        storeImages.save(reserved);

        // Puts the URL on the profile AND retires whatever was in this slot
        // before, object included.
        setImageUrl(store, reserved.getSlot(), imageUrls.forKey(reserved.getS3Key()));
        return toResponse(stores.saveAndFlush(store));
    }

    /**
     * Point a slot at a URL (or at nothing) and retire what it held before.
     *
     * The row bookkeeping is the reason this is not two setters: the STORED row
     * for the slot is what remembers which object the live URL refers to, so
     * replacing or clearing the URL without dropping that row leaks the object -
     * it is no longer reachable from anywhere and no longer deletable by
     * anything. The row that is being promoted right now is spared by id.
     */
    private void setImageUrl(SellerStore store, StoreImageSlot slot, String url) {
        List<String> superseded = new ArrayList<>();
        storeImages.findBySellerStoreIdAndSlot(store.getId(), slot).stream()
                .filter(image -> image.getStatus() == StoreImageStatus.STORED)
                .filter(image -> !imageUrls.forKey(image.getS3Key()).equals(url))
                .forEach(image -> {
                    superseded.add(image.getS3Key());
                    storeImages.delete(image);
                });
        deleteObjectsAfterCommit(superseded);

        if (slot == StoreImageSlot.COVER) {
            store.setCoverUrl(url);
        } else {
            store.setLogoUrl(url);
        }
    }

    /** Reservations for this slot that a newer one has overtaken. */
    private void discardPendingReservations(UUID storeId, StoreImageSlot slot) {
        List<String> keys = new ArrayList<>();
        storeImages.findBySellerStoreIdAndSlot(storeId, slot).stream()
                .filter(image -> image.getStatus() == StoreImageStatus.PENDING)
                .forEach(image -> {
                    keys.add(image.getS3Key());
                    storeImages.delete(image);
                });
        // Most of these keys were never written - the seller changed their mind
        // before the PUT finished - and S3 answers a delete of a missing key with
        // a 204 either way, so there is nothing to branch on.
        deleteObjectsAfterCommit(keys);
    }

    private HeadObjectResponse headStoredObject(SellerStoreImage image) {
        try {
            return s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(s3Bucket)
                    .key(image.getS3Key())
                    .build());
        } catch (NoSuchKeyException ex) {
            throw new ConflictException(
                    URI.create("https://api/errors/upload-not-found"),
                    "Upload not found",
                    "No uploaded file was found for store image " + image.getId()
                            + ". The presigned URL may have expired before the upload finished.",
                    List.of());
        } catch (SdkException ex) {
            throw new StorageUnavailableException(
                    "Store image upload isn't configured on this deployment: object storage could not "
                            + "be reached to verify the upload. See backend/.env.example (AWS_*/S3_* vars).", ex);
        }
    }

    /**
     * Objects go after the database says the rows are really gone, never before.
     * Object storage has no part in the transaction, so the two orders fail
     * differently: delete objects first and a rolled-back transaction leaves a
     * storefront whose cover 404s forever, while this way a failed delete leaves
     * an object nobody references - wasteful, logged, and fixable, which is the
     * better of the two. Same reasoning, and the same shape, as
     * SellerProductService.deleteObjectsAfterCommit.
     */
    private void deleteObjectsAfterCommit(List<String> keys) {
        if (keys.isEmpty()) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            deleteObjects(keys);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteObjects(keys);
            }
        });
    }

    private void deleteObjects(List<String> keys) {
        for (String key : keys) {
            try {
                s3Client.deleteObject(DeleteObjectRequest.builder().bucket(s3Bucket).key(key).build());
            } catch (SdkException ex) {
                // Never fatal: the rows are already gone and the seller's change
                // has committed. This is the leak worth an operator's attention,
                // not a reason to fail a request that has already succeeded.
                log.error("Dropped store image row but could not remove {} from bucket {}: {}",
                        key, s3Bucket, ex.getMessage());
            }
        }
    }

    // ------------------------------------------------------------- internals

    /**
     * This seller's store, creating the default one if this is the first thing
     * that ever asked for it.
     */
    // Package-private rather than private: SellerStoreRefQueryService needs the
    // same provision-on-first-read behaviour for a seller it is printing on
    // somebody else's screen, and a second copy of this loop is how the two
    // would end up disagreeing about what a default store looks like.
    SellerStore requireStore(UUID sellerId) {
        Optional<SellerStore> existing = stores.findBySellerId(sellerId);
        if (existing.isPresent()) {
            return existing.get();
        }

        DataIntegrityViolationException lastRace = null;
        for (int attempt = 0; attempt < PROVISION_ATTEMPTS; attempt++) {
            try {
                return provisioner.provision(sellerId);
            } catch (DataIntegrityViolationException race) {
                lastRace = race;
                Optional<SellerStore> winner = stores.findBySellerId(sellerId);
                if (winner.isPresent()) {
                    return winner.get();
                }
            }
        }
        throw lastRace;
    }

    /**
     * The 409 the contract promises, naming the field that collided so the form
     * can mark it rather than showing a bare "conflict".
     *
     * Modelled on SellerProductService's sku-taken: a ConflictException with a
     * type URI and a FieldError, which ApiExceptionHandler turns into the shared
     * RFC 7807 body with an errors array. StoreSettings.tsx already reads it -
     * it looks for the entry whose field is "handle".
     *
     * Excluding the caller's own store matters: re-saving the form without
     * touching the URL sends the handle back unchanged, and that must not
     * collide with itself.
     */
    private String requireHandleFree(String handle, UUID ownStoreId) {
        // A handle the routing owns is refused as a clash rather than as a validation
        // error: from the seller's side it IS taken, and StoreSettings.tsx already
        // marks the field from this shape.
        if (StoreHandles.isReserved(handle)) {
            throw new ConflictException(
                    URI.create("https://api/errors/handle-taken"),
                    "Handle already in use",
                    "Handle " + handle + " is reserved",
                    List.of(new ConflictException.FieldError("handle", "already in use")));
        }
        stores.findByHandle(handle)
                .filter(other -> !other.getId().equals(ownStoreId))
                .ifPresent(clash -> {
                    throw new ConflictException(
                            URI.create("https://api/errors/handle-taken"),
                            "Handle already in use",
                            "Handle " + handle + " belongs to another store",
                            List.of(new ConflictException.FieldError("handle", "already in use")));
                });
        return handle;
    }

    /**
     * Absent leaves the field alone; anything else - a value OR an explicit null
     * - is applied. The null case is the whole point: see PatchField.
     */
    private static <T> void applyIfPresent(PatchField<T> field, Consumer<T> apply) {
        if (field != null) {
            apply.accept(field.value());
        }
    }

    /** Blank clears an optional field back to the null the contract calls for. */
    private static String clearedIfBlank(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** Binary units, matching how the product-image caps are written. */
    private static String humanBytes(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        String[] units = {"KiB", "MiB", "GiB", "TiB"};
        double value = bytes;
        int unit = -1;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return "%.1f %s".formatted(value, units[unit]);
    }

    private static StoreProfileResponse toResponse(SellerStore store) {
        return new StoreProfileResponse(
                store.getId(),
                store.getName(),
                store.getHandle(),
                store.getTagline(),
                store.getLocation(),
                store.getFoundedYear(),
                store.getSupportEmail(),
                store.getAbout(),
                store.getCoverUrl(),
                store.getLogoUrl(),
                store.getStatus(),
                store.getVacationNote(),
                store.getUpdatedAt());
    }
}
