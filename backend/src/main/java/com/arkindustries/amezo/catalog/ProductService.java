package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.api.ProductExistenceQuery;
import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.catalog.dto.ProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.ProductSummaryResponse;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.reviews.api.ReviewSummaryQuery;
import com.arkindustries.amezo.reviews.api.ReviewSummaryView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
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

    public Page<ProductSummaryResponse> search(String query, Pageable pageable) {
        // Spring Data JPA rejects a Sort on a native @Query at runtime
        // (InvalidJpaQueryMethodException) - Pageable's default argument
        // resolver binds a client-supplied ?sort= automatically, so strip
        // it here rather than let a real request 500. Sort itself is
        // deferred business logic (see docs/api-design.md), not built yet.
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        return productRepository.search(query, unsorted).map(ProductMapper::toSummary);
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
