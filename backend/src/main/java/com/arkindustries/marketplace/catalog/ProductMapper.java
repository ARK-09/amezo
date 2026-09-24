package com.arkindustries.marketplace.catalog;

import com.arkindustries.marketplace.catalog.dto.ImageResponse;
import com.arkindustries.marketplace.catalog.dto.ProductDetailResponse;
import com.arkindustries.marketplace.catalog.dto.ProductSummaryResponse;
import com.arkindustries.marketplace.catalog.dto.ReviewSummaryResponse;
import com.arkindustries.marketplace.catalog.dto.VariantDetailResponse;
import com.arkindustries.marketplace.reviews.api.ReviewSummaryView;

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
            String s3Bucket,
            String s3Region) {

        List<ImageResponse> imageResponses = images.stream()
                .map(image -> new ImageResponse(image.getId(), imageUrl(image.getS3Key(), s3Bucket, s3Region),
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

    // Assumes a public-read bucket, same as every other product image on
    // the page - no presigning here, unlike the private evidence photos in
    // the deferred returns/warranty work (next-build.md), which is a
    // different privacy requirement entirely.
    private static String imageUrl(String s3Key, String bucket, String region) {
        return "https://%s.s3.%s.amazonaws.com/%s".formatted(bucket, region, s3Key);
    }
}
