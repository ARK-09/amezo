package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.ImageResponse;
import com.arkindustries.amezo.catalog.dto.ProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.ProductSummaryResponse;
import com.arkindustries.amezo.catalog.dto.ReviewSummaryResponse;
import com.arkindustries.amezo.catalog.dto.VariantDetailResponse;
import com.arkindustries.amezo.reviews.api.ReviewSummaryView;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// Package-private: only ProductService uses this. Nothing outside catalog
// should ever need to map a Product entity itself.
class ProductMapper {

    static ProductSummaryResponse toSummary(Product product) {
        return new ProductSummaryResponse(
                product.getId(),
                product.getTitle(),
                product.getBrandName(),
                product.getCategory()
        );
    }

    static ProductDetailResponse toDetail(
            Product product,
            List<Image> images,
            List<Variant> variants,
            Map<UUID, Offer> offersByVariantId,
            ReviewSummaryView summary,
            ImageUrlResolver imageUrls) {

        List<ImageResponse> imageResponses = images.stream()
                .map(image -> new ImageResponse(image.getId(), imageUrls.forKey(image.getS3Key()),
                        image.getPosition()))
                .toList();

        List<VariantDetailResponse> variantResponses = variants.stream()
                .map(variant -> toVariantDetail(variant, offersByVariantId.get(variant.getId())))
                .toList();

        ReviewSummaryResponse reviewSummary =
                new ReviewSummaryResponse(summary.averageRating(), summary.count());

        return new ProductDetailResponse(
                product.getId(),
                product.getTitle(),
                product.getBrandName(),
                product.getCategory(),
                product.getDescription(),
                imageResponses,
                variantResponses,
                reviewSummary
        );
    }

    private static VariantDetailResponse toVariantDetail(Variant variant, Offer offer) {
        // offer is only absent if a variant was created without one, which
        // shouldn't happen given the intended create-together flow, but
        // nothing in the schema strictly forbids it (see OfferRepository) -
        // treat that as "no stock" rather than throwing.
        BigDecimal price = offer != null ? offer.getPrice() : null;
        int stockQty = offer != null ? offer.getStockQty() : 0;
        return new VariantDetailResponse(variant.getId(), variant.getLabel(), variant.getSku(), price, stockQty,
                stockQty > 0);
    }
}
