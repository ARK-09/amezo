package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.CreateProductRequest;
import com.arkindustries.amezo.catalog.dto.CreateProductResponse;
import com.arkindustries.amezo.catalog.dto.CreateVariantRequest;
import com.arkindustries.amezo.catalog.dto.ImageConfirmRequest;
import com.arkindustries.amezo.catalog.dto.ImageResponse;
import com.arkindustries.amezo.catalog.dto.ImageUploadUrlRequest;
import com.arkindustries.amezo.catalog.dto.ImageUploadUrlResponse;
import com.arkindustries.amezo.catalog.dto.SellerProductSummaryResponse;
import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.common.exception.PayloadTooLargeException;
import com.arkindustries.amezo.common.exception.StorageCapReachedException;
import com.arkindustries.amezo.common.exception.StorageUnavailableException;
import com.arkindustries.amezo.identity.api.CurrentSeller;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Seller-portal product management - separate from the public ProductService
 * (search/detail) since these are auth-gated writes with ownership checks,
 * a different concern from public reads. No edit endpoint - add and delete
 * only, per the time-boxed scope this was built under.
 */
@Service
public class SellerProductService {

    private static final Duration UPLOAD_URL_TTL = Duration.ofMinutes(15);

    private final ProductRepository productRepository;
    private final VariantRepository variantRepository;
    private final OfferRepository offerRepository;
    private final ImageRepository imageRepository;
    private final CurrentSeller currentSeller;
    private final S3Presigner s3Presigner;
    private final String s3Bucket;
    private final ImageUrlResolver imageUrls;
    private final long maxUploadBytes;
    private final long maxTotalBytes;

    public SellerProductService(
            ProductRepository productRepository,
            VariantRepository variantRepository,
            OfferRepository offerRepository,
            ImageRepository imageRepository,
            CurrentSeller currentSeller,
            S3Presigner s3Presigner,
            @Value("${app.s3.bucket}") String s3Bucket,
            ImageUrlResolver imageUrls,
            @Value("${app.s3.max-upload-bytes}") long maxUploadBytes,
            @Value("${app.s3.max-total-bytes}") long maxTotalBytes) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.offerRepository = offerRepository;
        this.imageRepository = imageRepository;
        this.currentSeller = currentSeller;
        this.s3Presigner = s3Presigner;
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

        return products.map(product -> new SellerProductSummaryResponse(
                product.getId(),
                product.getTitle(),
                thumbnails.containsKey(product.getId())
                        ? imageUrls.forKey(thumbnails.get(product.getId()))
                        : null,
                product.getCategory(),
                variantCounts.getOrDefault(product.getId(), 0L).intValue(),
                product.getCreatedAt()));
    }

    @Transactional
    public CreateProductResponse create(CreateProductRequest request) {
        Product product = productRepository.save(Product.builder()
                .sellerId(currentSeller.sellerId())
                .title(request.title())
                .brandName(request.brandName())
                .description(request.description())
                .category(request.category())
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

    @Transactional
    public void delete(UUID productId) {
        Product product = ownedProduct(productId);

        List<UUID> variantIds = variantRepository.findByProductId(product.getId()).stream()
                .map(Variant::getId)
                .toList();

        offerRepository.deleteByVariantIdIn(variantIds);
        imageRepository.deleteByProductId(product.getId());
        variantRepository.deleteByProductId(product.getId());
        productRepository.delete(product);
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

        // No real S3 HEAD check here (see docs/api-design.md's PATCH
        // /images/{id} for the intended design) - trusts the client's
        // confirm call. A time-boxed simplification, flagged rather than
        // silently pretending to verify the upload.
        if (image.getStatus() != ImageStatus.PENDING) {
            throw new ConflictException(
                    java.net.URI.create("https://api/errors/already-confirmed"),
                    "Already confirmed",
                    "Image " + image.getId() + " was already confirmed",
                    List.of());
        }
        image.setStatus(ImageStatus.STORED);
        imageRepository.save(image);

        return new ImageResponse(image.getId(), imageUrls.forKey(image.getS3Key()), image.getPosition());
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
