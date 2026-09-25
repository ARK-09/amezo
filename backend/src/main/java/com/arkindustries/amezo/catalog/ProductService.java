package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.api.ProductExistenceQuery;
import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.catalog.dto.ProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.ProductSummaryResponse;
import com.arkindustries.amezo.catalog.dto.VariantOfferResponse;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.reviews.api.ReviewSummaryQuery;
import com.arkindustries.amezo.reviews.api.ReviewSummaryView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ProductService implements ProductExistenceQuery, ProductVariantSummaryQuery {

    private final ProductRepository productRepository;
    private final VariantRepository variantRepository;
    private final OfferRepository offerRepository;
    private final ImageRepository imageRepository;
    private final ReviewSummaryQuery reviewSummaryQuery;
    private final ImageUrlResolver imageUrls;

    public ProductService(
            ProductRepository productRepository,
            VariantRepository variantRepository,
            OfferRepository offerRepository,
            ImageRepository imageRepository,
            ReviewSummaryQuery reviewSummaryQuery,
            ImageUrlResolver imageUrls) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.offerRepository = offerRepository;
        this.imageRepository = imageRepository;
        this.reviewSummaryQuery = reviewSummaryQuery;
        this.imageUrls = imageUrls;
    }

    public Page<ProductSummaryResponse> search(
            String query,
            String category,
            BigDecimal priceMin,
            BigDecimal priceMax,
            boolean inStockOnly,
            String sort,
            Pageable pageable) {
        // Spring Data JPA rejects a Sort on a native @Query at runtime
        // (InvalidJpaQueryMethodException) and Pageable's default resolver binds a
        // client-supplied ?sort= automatically - so strip it and let the explicit
        // sort parameter drive ORDER BY inside the query, where the aggregate it
        // sorts on actually exists.
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        Page<Product> products = productRepository.search(
                query, category, priceMin, priceMax, inStockOnly, sort, unsorted);

        List<UUID> productIds = products.getContent().stream().map(Product::getId).toList();
        if (productIds.isEmpty()) {
            return products.map(product -> ProductMapper.toSummary(product, null, null, false));
        }

        // Three batched lookups for the whole page, not per card: variants to reach
        // the offers, offers for price and stock, images for the thumbnail.
        List<Variant> variants = variantRepository.findByProductIdIn(productIds);
        Map<UUID, UUID> productIdByVariantId = variants.stream()
                .collect(Collectors.toMap(Variant::getId, Variant::getProductId));
        List<Offer> offers = variants.isEmpty()
                ? List.of()
                : offerRepository.findByVariantIdIn(productIdByVariantId.keySet());

        Map<UUID, BigDecimal> priceFromByProductId = new HashMap<>();
        Map<UUID, Boolean> inStockByProductId = new HashMap<>();
        for (Offer offer : offers) {
            UUID productId = productIdByVariantId.get(offer.getVariantId());
            priceFromByProductId.merge(productId, offer.getPrice(), BigDecimal::min);
            inStockByProductId.merge(productId, offer.getStockQty() > 0, Boolean::logicalOr);
        }
        Map<UUID, String> thumbnailsByProductId = thumbnailUrlsByProductId(productIds);

        return products.map(product -> ProductMapper.toSummary(
                product,
                priceFromByProductId.get(product.getId()),
                thumbnailsByProductId.get(product.getId()),
                inStockByProductId.getOrDefault(product.getId(), false)));
    }

    /**
     * The cart's batch lookup. A variant whose offer or product has since been
     * deleted is left out of the response, exactly like an id that never existed:
     * the caller is a browser-stored cart, and a line it can no longer resolve
     * should disappear from the drawer rather than fail it.
     */
    public List<VariantOfferResponse> getVariantOffers(List<UUID> variantIds) {
        if (variantIds.isEmpty()) {
            return List.of();
        }

        List<Variant> variants = variantRepository.findByIdIn(variantIds);
        if (variants.isEmpty()) {
            return List.of();
        }

        Map<UUID, Offer> offersByVariantId = offerRepository
                .findByVariantIdIn(variants.stream().map(Variant::getId).toList()).stream()
                .collect(Collectors.toMap(Offer::getVariantId, Function.identity()));
        List<UUID> productIds = variants.stream().map(Variant::getProductId).distinct().toList();
        Map<UUID, Product> productsById = productRepository.findAllById(productIds).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        Map<UUID, String> thumbnailsByProductId = thumbnailUrlsByProductId(productIds);

        return variants.stream()
                .map(variant -> {
                    Offer offer = offersByVariantId.get(variant.getId());
                    Product product = productsById.get(variant.getProductId());
                    if (offer == null || product == null) {
                        return null;
                    }
                    return new VariantOfferResponse(
                            variant.getId(),
                            product.getId(),
                            product.getTitle(),
                            variant.getLabel(),
                            thumbnailsByProductId.get(product.getId()),
                            offer.getPrice(),
                            offer.getStockQty());
                })
                .filter(Objects::nonNull)
                .toList();
    }

    /** First stored image per product, as a public URL - the card/cart thumbnail. */
    private Map<UUID, String> thumbnailUrlsByProductId(List<UUID> productIds) {
        return imageRepository
                .findByProductIdInAndStatusOrderByPositionAsc(productIds, ImageStatus.STORED).stream()
                .collect(Collectors.toMap(
                        Image::getProductId,
                        image -> imageUrls.forKey(image.getS3Key()),
                        // Ordered by position, so the first one wins.
                        (first, second) -> first));
    }

    public ProductDetailResponse getDetail(UUID id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product " + id + " not found"));

        List<Image> images = imageRepository.findTop7ByProductIdAndStatusOrderByPositionAsc(id, ImageStatus.STORED);
        List<Variant> variants = variantRepository.findByProductId(id);

        List<UUID> variantIds = variants.stream().map(Variant::getId).toList();
        Map<UUID, Offer> offersByVariantId = variantIds.isEmpty()
                ? Map.of()
                : offerRepository.findByVariantIdIn(variantIds).stream()
                        .collect(Collectors.toMap(Offer::getVariantId, Function.identity()));

        // Cross-feature call through reviews' public interface, not a
        // repository import - per the architecture rules.
        ReviewSummaryView summary = reviewSummaryQuery.getSummary(id);

        return ProductMapper.toDetail(product, images, variants, offersByVariantId, summary, imageUrls);
    }

    @Override
    public boolean exists(UUID productId) {
        return productRepository.existsById(productId);
    }

    @Override
    public Map<UUID, String> productTitlesByIds(Collection<UUID> productIds) {
        return productRepository.findAllById(productIds).stream()
                .collect(Collectors.toMap(Product::getId, Product::getTitle));
    }

    @Override
    public Map<UUID, String> variantLabelsByIds(Collection<UUID> variantIds) {
        return variantRepository.findAllById(variantIds).stream()
                .collect(Collectors.toMap(Variant::getId, Variant::getLabel));
    }
}
