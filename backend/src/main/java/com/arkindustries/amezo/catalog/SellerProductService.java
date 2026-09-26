package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.CategoryResponse;
import com.arkindustries.amezo.catalog.dto.CreateProductRequest;
import com.arkindustries.amezo.catalog.dto.CreateProductResponse;
import com.arkindustries.amezo.catalog.dto.CreateVariantRequest;
import com.arkindustries.amezo.catalog.dto.ImageConfirmRequest;
import com.arkindustries.amezo.catalog.dto.ImageResponse;
import com.arkindustries.amezo.catalog.dto.ImageUploadUrlRequest;
import com.arkindustries.amezo.catalog.dto.ImageUploadUrlResponse;
import com.arkindustries.amezo.catalog.dto.SellerProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.SellerProductSummaryResponse;
import com.arkindustries.amezo.catalog.dto.SellerVariantResponse;
import com.arkindustries.amezo.catalog.dto.UpdateProductRequest;
import com.arkindustries.amezo.catalog.dto.UpdateVariantRequest;
import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.common.exception.PayloadTooLargeException;
import com.arkindustries.amezo.common.exception.StorageCapReachedException;
import com.arkindustries.amezo.common.exception.StorageUnavailableException;
import com.arkindustries.amezo.identity.api.CurrentSeller;
import com.arkindustries.amezo.orders.api.OfferOrderHistoryQuery;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Seller-portal product management - separate from the public ProductService
 * (search/detail) since these are auth-gated writes with ownership checks,
 * a different concern from public reads. No edit endpoint - add and delete
 * only, per the time-boxed scope this was built under.
 */
@Service
public class SellerProductService {

    private static final Logger log = LoggerFactory.getLogger(SellerProductService.class);

    private static final Duration UPLOAD_URL_TTL = Duration.ofMinutes(15);

    /** Matches the read path's cap (ImageRepository.findTop7ByProductId...). */
    private static final int MAX_IMAGES_PER_PRODUCT = 7;

    private final ProductRepository productRepository;
    private final VariantRepository variantRepository;
    private final OfferRepository offerRepository;
    private final ImageRepository imageRepository;
    private final CategoryService categoryService;
    private final CurrentSeller currentSeller;
    private final OfferOrderHistoryQuery offerOrderHistory;
    private final S3Presigner s3Presigner;
    private final S3Client s3Client;
    private final String s3Bucket;
    private final ImageUrlResolver imageUrls;
    private final long maxUploadBytes;
    private final long maxTotalBytes;

    public SellerProductService(
            ProductRepository productRepository,
            VariantRepository variantRepository,
            OfferRepository offerRepository,
            ImageRepository imageRepository,
            CategoryService categoryService,
            CurrentSeller currentSeller,
            OfferOrderHistoryQuery offerOrderHistory,
            S3Presigner s3Presigner,
            S3Client s3Client,
            @Value("${app.s3.bucket}") String s3Bucket,
            ImageUrlResolver imageUrls,
            @Value("${app.s3.max-upload-bytes}") long maxUploadBytes,
            @Value("${app.s3.max-total-bytes}") long maxTotalBytes) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.offerRepository = offerRepository;
        this.imageRepository = imageRepository;
        this.categoryService = categoryService;
        this.currentSeller = currentSeller;
        this.offerOrderHistory = offerOrderHistory;
        this.s3Presigner = s3Presigner;
        this.s3Client = s3Client;
        this.s3Bucket = s3Bucket;
        this.imageUrls = imageUrls;
        this.maxUploadBytes = maxUploadBytes;
        this.maxTotalBytes = maxTotalBytes;
    }

    public Page<SellerProductSummaryResponse> listMine(Pageable pageable) {
        UUID sellerId = currentSeller.sellerId();
        Page<Product> products = productRepository.findBySellerId(sellerId, pageable);

        List<UUID> productIds = products.map(Product::getId).toList();
        Map<UUID, Long> variantCounts = variantRepository.findByProductIdIn(productIds).stream()
                .collect(Collectors.groupingBy(Variant::getProductId, Collectors.counting()));
        Map<UUID, String> thumbnails = imageRepository
                .findByProductIdInAndStatusOrderByPositionAsc(productIds, ImageStatus.STORED).stream()
                .collect(Collectors.toMap(Image::getProductId, Image::getS3Key, (first, second) -> first));

        Map<UUID, CategoryResponse> categoriesById = categoryService.byId();

        return products.map(product -> new SellerProductSummaryResponse(
                product.getId(),
                product.getSlug(),
                product.getTitle(),
                thumbnails.containsKey(product.getId())
                        ? imageUrls.forKey(thumbnails.get(product.getId()))
                        : null,
                categoriesById.get(product.getCategoryId()),
                variantCounts.getOrDefault(product.getId(), 0L).intValue(),
                product.getCreatedAt()));
    }

    @Transactional
    public CreateProductResponse create(CreateProductRequest request) {
        // Resolved before anything is written: a slug that isn't a live system
        // category fails the whole create, rather than leaving a product filed
        // under something a client invented.
        Category category = categoryService.requireSelectable(request.categorySlug());

        Product product = productRepository.save(Product.builder()
                .sellerId(currentSeller.sellerId())
                .title(request.title())
                .slug(Slugs.uniqueSlug(request.title(), productRepository::existsBySlug))
                .brandName(request.brandName())
                .description(request.description())
                .categoryId(category.getId())
                .build());

        for (CreateVariantRequest variantRequest : request.variants()) {
            Variant variant = variantRepository.save(Variant.builder()
                    .productId(product.getId())
                    .label(variantRequest.label())
                    .sku(variantRequest.sku())
                    .build());
            offerRepository.save(Offer.builder()
                    .variantId(variant.getId())
                    .price(variantRequest.price())
                    .stockQty(variantRequest.stockQty())
                    .build());
        }

        return new CreateProductResponse(product.getId());
    }

    /**
     * One product as its own seller sees it. Not the public GET /products/{id}:
     * that hides exact stock behind an inStock flag and only shows STORED images,
     * both of which the person editing needs to see.
     */
    @Transactional(readOnly = true)
    public SellerProductDetailResponse getMine(UUID productId) {
        Product product = ownedProduct(productId);

        List<Variant> variants = variantRepository.findByProductId(product.getId());
        Map<UUID, Offer> offersByVariantId = variants.isEmpty()
                ? Map.of()
                : offerRepository.findByVariantIdIn(variants.stream().map(Variant::getId).toList()).stream()
                        .collect(Collectors.toMap(Offer::getVariantId, Function.identity()));

        List<SellerVariantResponse> variantResponses = variants.stream()
                .map(variant -> {
                    Offer offer = offersByVariantId.get(variant.getId());
                    return new SellerVariantResponse(
                            variant.getId(),
                            variant.getLabel(),
                            variant.getSku(),
                            offer != null ? offer.getPrice() : null,
                            offer != null ? offer.getStockQty() : 0);
                })
                .toList();

        List<SellerProductDetailResponse.SellerImageResponse> imageResponses =
                imageRepository.findByProductId(product.getId()).stream()
                        .sorted(Comparator.comparingInt(Image::getPosition))
                        .map(image -> new SellerProductDetailResponse.SellerImageResponse(
                                image.getId(),
                                imageUrls.forKey(image.getS3Key()),
                                image.getPosition(),
                                image.getStatus().name()))
                        .toList();

        return new SellerProductDetailResponse(
                product.getId(),
                product.getSlug(),
                product.getTitle(),
                product.getBrandName(),
                product.getDescription(),
                categoryService.byIdOrThrow(product.getCategoryId()),
                variantResponses,
                imageResponses);
    }

    /** Partial update: only the fields the request actually carries are written. */
    @Transactional
    public SellerProductDetailResponse update(UUID productId, UpdateProductRequest request) {
        Product product = ownedProduct(productId);

        if (request.title() != null) {
            // The slug is NOT regenerated. Every link already handed out points at
            // the old one, and a renamed product is the same product - see
            // Product.slug.
            product.setTitle(request.title());
        }
        if (request.brandName() != null) {
            product.setBrandName(request.brandName());
        }
        if (request.description() != null) {
            product.setDescription(request.description());
        }
        if (request.categorySlug() != null) {
            product.setCategoryId(categoryService.requireSelectable(request.categorySlug()).getId());
        }
        productRepository.save(product);

        return getMine(product.getId());
    }

    /**
     * Writes across both tables the create request spans: label and sku on the
     * variant, price and stock on its offer. Ownership is the variant's product's
     * seller - a variant id is not a capability, so someone else's variant is a
     * 404 here exactly as their product is.
     */
    @Transactional
    public SellerVariantResponse updateVariant(UUID variantId, UpdateVariantRequest request) {
        Variant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new NotFoundException("Variant " + variantId + " not found"));
        ownedProduct(variant.getProductId());

        if (request.label() != null) {
            variant.setLabel(request.label());
        }
        if (request.sku() != null && !request.sku().equals(variant.getSku())) {
            // Checked rather than left to the unique index: a caught constraint
            // violation would reach the seller as a 500 naming nothing useful.
            requireSkuFree(request.sku(), variant.getId());
            variant.setSku(request.sku());
        }
        variantRepository.save(variant);

        Offer offer = offerRepository.findByVariantId(variant.getId())
                .orElseThrow(() -> new NotFoundException("Variant " + variantId + " has no offer"));
        if (request.price() != null) {
            offer.setPrice(request.price());
        }
        if (request.stockQty() != null) {
            offer.setStockQty(request.stockQty());
        }
        offerRepository.save(offer);

        return new SellerVariantResponse(
                variant.getId(), variant.getLabel(), variant.getSku(), offer.getPrice(), offer.getStockQty());
    }

    /**
     * Adds a variant to an existing product, same flattening as create: the
     * variant row and its offer are written together, because a variant with no
     * offer has no price and can't be bought.
     */
    @Transactional
    public SellerVariantResponse addVariant(UUID productId, CreateVariantRequest request) {
        Product product = ownedProduct(productId);
        requireSkuFree(request.sku(), null);

        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId())
                .label(request.label())
                .sku(request.sku())
                .build());
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId())
                .price(request.price())
                .stockQty(request.stockQty())
                .build());

        return new SellerVariantResponse(
                variant.getId(), variant.getLabel(), variant.getSku(), offer.getPrice(), offer.getStockQty());
    }

    /**
     * Two refusals, both 409, both about something the seller can't undo by
     * retrying: a variant that has been ordered can't go (order_line.offer_id is
     * a foreign key), and the last variant can't go either, because create
     * requires at least one and a product with none has no price to show and
     * nothing to add to a cart.
     */
    @Transactional
    public void deleteVariant(UUID variantId) {
        Variant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new NotFoundException("Variant " + variantId + " not found"));
        Product product = ownedProduct(variant.getProductId());

        List<Variant> siblings = variantRepository.findByProductId(product.getId());
        if (siblings.size() <= 1) {
            throw new ConflictException(
                    java.net.URI.create("https://api/errors/last-variant"),
                    "Last variant",
                    "A product needs at least one variant. Delete the product instead, "
                            + "or add another variant first.",
                    List.of());
        }

        Offer offer = offerRepository.findByVariantId(variant.getId()).orElse(null);
        if (offer != null && offerOrderHistory.anySoldOffer(List.of(offer.getId()))) {
            throw new ConflictException(
                    java.net.URI.create("https://api/errors/variant-has-orders"),
                    "Variant has orders",
                    "Variant " + variant.getId() + " has been ordered and can't be deleted. "
                            + "Set its stock to 0 to stop selling it.",
                    List.of());
        }

        // Images can hang off a variant rather than a product, so its own images
        // go with it - rows and objects both, or image.variant_id's foreign key
        // blocks the delete below.
        List<Image> variantImages = imageRepository.findByVariantIdIn(List.of(variant.getId()));
        List<String> keys = variantImages.stream().map(Image::getS3Key).toList();
        if (!variantImages.isEmpty()) {
            imageRepository.deleteByVariantIdIn(List.of(variant.getId()));
        }

        if (offer != null) {
            offerRepository.delete(offer);
        }
        variantRepository.delete(variant);

        deleteObjectsAfterCommit(keys);
    }

    /** Removes one image: the row, and the object it points at. */
    @Transactional
    public void deleteImage(UUID imageId) {
        Image image = imageRepository.findById(imageId)
                .orElseThrow(() -> new NotFoundException("Image " + imageId + " not found"));

        // Ownership runs through whichever parent the row has - the image table
        // allows either, so a variant-linked image resolves through its variant.
        UUID productId = image.getProductId();
        if (productId == null) {
            productId = variantRepository.findById(image.getVariantId())
                    .map(Variant::getProductId)
                    .orElseThrow(() -> new NotFoundException("Image " + imageId + " not found"));
        }
        ownedProduct(productId);

        imageRepository.delete(image);
        deleteObjectsAfterCommit(List.of(image.getS3Key()));
    }

    /**
     * Shared by add-variant and the SKU half of updateVariant. excludeVariantId
     * lets an edit re-submit a variant's own SKU without colliding with itself.
     */
    private void requireSkuFree(String sku, UUID excludeVariantId) {
        variantRepository.findBySku(sku)
                .filter(existing -> !existing.getId().equals(excludeVariantId))
                .ifPresent(clash -> {
                    throw new ConflictException(
                            java.net.URI.create("https://api/errors/sku-taken"),
                            "SKU already in use",
                            "SKU " + sku + " belongs to another variant",
                            List.of(new ConflictException.FieldError("sku", "already in use")));
                });
    }

    @Transactional
    public void delete(UUID productId) {
        Product product = ownedProduct(productId);

        List<UUID> variantIds = variantRepository.findByProductId(product.getId()).stream()
                .map(Variant::getId)
                .toList();

        // A sold offer cannot be deleted - order_line.offer_id is a foreign key,
        // on purpose, so an order stays traceable to the offer it was placed
        // against. Without this check the delete reached the database and came
        // back as a 500 on a constraint name; the seller's actual options are to
        // leave it listed or take it out of stock.
        List<UUID> offerIds = variantIds.isEmpty()
                ? List.of()
                : offerRepository.findByVariantIdIn(variantIds).stream().map(Offer::getId).toList();
        if (offerOrderHistory.anySoldOffer(offerIds)) {
            throw new ConflictException(
                    java.net.URI.create("https://api/errors/product-has-orders"),
                    "Product has orders",
                    "Product " + product.getId() + " has been ordered and can't be deleted. "
                            + "Set its variants' stock to 0 to stop selling it.",
                    List.of());
        }

        // Collected before the rows go: the keys only exist on those rows, and
        // without them the objects would sit in the bucket forever - billed, and
        // invisible to the storage cap, which counts image rows. That drift is the
        // whole reason this deletes from the bucket at all.
        List<String> keys = new ArrayList<>();
        imageRepository.findByProductId(product.getId()).forEach(image -> keys.add(image.getS3Key()));
        if (!variantIds.isEmpty()) {
            imageRepository.findByVariantIdIn(variantIds).forEach(image -> keys.add(image.getS3Key()));
            imageRepository.deleteByVariantIdIn(variantIds);
        }

        offerRepository.deleteByVariantIdIn(variantIds);
        imageRepository.deleteByProductId(product.getId());
        variantRepository.deleteByProductId(product.getId());
        productRepository.delete(product);

        deleteObjectsAfterCommit(keys);
    }

    /**
     * Objects go after the database says the rows are really gone, never before.
     * Object storage has no part in the transaction, so the two orders fail
     * differently: delete objects first and a rolled-back transaction leaves a
     * live product whose images 404 forever, while this way a failed delete leaves
     * objects nobody references - wasteful, logged, and fixable, which is the
     * better of the two.
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

    /**
     * One request per key rather than a batch delete: a product holds at most a
     * handful of images, every S3-compatible provider implements single-object
     * DELETE identically, and a partial batch failure is fiddlier to report than a
     * per-key loop that logs what it couldn't remove.
     */
    private void deleteObjects(List<String> keys) {
        for (String key : keys) {
            try {
                s3Client.deleteObject(DeleteObjectRequest.builder().bucket(s3Bucket).key(key).build());
            } catch (SdkException ex) {
                // Never fatal: the rows are already gone and the caller's delete
                // succeeded. This is the leak worth an operator's attention, not a
                // reason to fail a request that has already been committed.
                log.error("Deleted image row but could not remove {} from bucket {}: {}",
                        key, s3Bucket, ex.getMessage());
            }
        }
    }

    /**
     * Transactional so the reserved row and the URL it reserves for live or die
     * together: the image row is written before presigning (its id is what the
     * confirm step quotes), and without a rollback a failed presign would leave a
     * PENDING row holding quota against a cap for an upload that can never happen.
     */
    @Transactional
    public ImageUploadUrlResponse createUploadUrl(UUID productId, ImageUploadUrlRequest request) {
        Product product = ownedProduct(productId);
        long sizeBytes = request.fileSizeBytes();
        checkStorageBudget(sizeBytes);

        // Enforced here now that images can be added after creation, not just in
        // one shot at create time: the read path already caps at 7
        // (findTop7ByProductId...), so an eighth would upload, cost storage, and
        // never render.
        if (imageRepository.findByProductId(product.getId()).size() >= MAX_IMAGES_PER_PRODUCT) {
            throw new ConflictException(
                    java.net.URI.create("https://api/errors/too-many-images"),
                    "Too many images",
                    "A product can hold at most " + MAX_IMAGES_PER_PRODUCT
                            + " images. Remove one before adding another.",
                    List.of());
        }

        Image image = imageRepository.save(Image.builder()
                .productId(product.getId())
                .s3Key("products/" + product.getId() + "/" + UUID.randomUUID())
                .position(request.position())
                .status(ImageStatus.PENDING)
                .sizeBytes(sizeBytes)
                .build());

        PutObjectRequest.Builder putObjectRequest = PutObjectRequest.builder()
                .bucket(s3Bucket)
                .key(image.getS3Key())
                // Signing the length is what makes the declared size binding rather
                // than a claim: Content-Length is part of the signature, so a client
                // that presigns for 1 MB and then PUTs 5 GB gets a 403 from the
                // bucket, not a surprise line on the storage bill.
                .contentLength(sizeBytes)
                .contentType(request.contentType());

        PresignedPutObjectRequest presigned;
        try {
            presigned = s3Presigner.presignPutObject(PutObjectPresignRequest.builder()
                    .signatureDuration(UPLOAD_URL_TTL)
                    .putObjectRequest(putObjectRequest.build())
                    .build());
        } catch (SdkException ex) {
            // Overwhelmingly this is "no credentials in the chain" on a deployment
            // that skipped the object-storage vars, which everything except image
            // upload runs fine without. A 503 naming that beats a 500 whose only
            // clue is a stack trace in the server log the seller can't see.
            throw new StorageUnavailableException(
                    "Image upload isn't configured on this deployment: object storage rejected the "
                            + "request to sign an upload URL. See backend/.env.example (AWS_*/S3_* vars).", ex);
        }

        return new ImageUploadUrlResponse(
                image.getId(),
                image.getStatus().name(),
                presigned.url().toString(),
                Instant.now().plus(UPLOAD_URL_TTL));
    }

    public ImageResponse confirmImage(UUID productId, ImageConfirmRequest request) {
        Product product = ownedProduct(productId);

        Image image = imageRepository.findById(request.imageId())
                .filter(candidate -> candidate.getProductId() != null && candidate.getProductId().equals(product.getId()))
                .orElseThrow(() -> new NotFoundException("Image " + request.imageId() + " not found on this product"));

        if (image.getStatus() != ImageStatus.PENDING) {
            throw new ConflictException(
                    java.net.URI.create("https://api/errors/already-confirmed"),
                    "Already confirmed",
                    "Image " + image.getId() + " was already confirmed",
                    List.of());
        }
        // Verified against the bucket rather than taken on trust: confirm is a
        // client call, and a STORED row with no object behind it renders as a
        // broken image on the product page for good. The response also carries the
        // object's real size, which replaces the size the client declared at
        // presign time - that is what the storage cap counts, so it should be the
        // bucket's number, not the client's.
        HeadObjectResponse head = headStoredObject(image);
        image.setStatus(ImageStatus.STORED);
        image.setSizeBytes(head.contentLength());
        imageRepository.save(image);

        return new ImageResponse(image.getId(), imageUrls.forKey(image.getS3Key()), image.getPosition());
    }

    private HeadObjectResponse headStoredObject(Image image) {
        try {
            return s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(s3Bucket)
                    .key(image.getS3Key())
                    .build());
        } catch (NoSuchKeyException ex) {
            throw new ConflictException(
                    java.net.URI.create("https://api/errors/upload-not-found"),
                    "Upload not found",
                    "No uploaded file was found for image " + image.getId()
                            + ". The presigned URL may have expired before the upload finished.",
                    List.of());
        } catch (SdkException ex) {
            // Same reasoning as the presign path: a deployment with no object
            // storage configured says so, instead of 500ing on a stack trace.
            throw new StorageUnavailableException(
                    "Image upload isn't configured on this deployment: object storage could not be "
                            + "reached to verify the upload. See backend/.env.example (AWS_*/S3_* vars).", ex);
        }
    }

    /**
     * Two ceilings, both configurable (app.s3.max-upload-bytes /
     * max-total-bytes): one file's size, and everything this deployment has
     * stored. The second is the one that costs money - object storage is billed
     * per GB and the free tiers this deploys on stop being free past 10 GB, so
     * past the cap the endpoint stops handing out URLs instead of letting the
     * bill run. Checked before presigning, because a URL, once issued, is a
     * capability the bucket will honour for the whole TTL whatever we later think
     * of it.
     */
    private void checkStorageBudget(long sizeBytes) {
        if (sizeBytes > maxUploadBytes) {
            throw new PayloadTooLargeException("Image is %s, over the %s per-file limit"
                    .formatted(humanBytes(sizeBytes), humanBytes(maxUploadBytes)));
        }

        long used = imageRepository.sumStoredAndReservedBytes(Instant.now().minus(UPLOAD_URL_TTL));
        if (used + sizeBytes > maxTotalBytes) {
            throw new StorageCapReachedException(
                    "Image storage is full: %s of %s used, and this upload needs %s. Delete images or raise the cap."
                            .formatted(humanBytes(used), humanBytes(maxTotalBytes), humanBytes(sizeBytes)));
        }
    }

    /** Binary units, matching how the caps are written in application.yml. */
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

    private Product ownedProduct(UUID productId) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new NotFoundException("Product " + productId + " not found"));
        if (!product.getSellerId().equals(currentSeller.sellerId())) {
            throw new NotFoundException("Product " + productId + " not found");
        }
        return product;
    }
}
