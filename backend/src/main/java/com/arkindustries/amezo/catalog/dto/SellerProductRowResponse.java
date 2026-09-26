package com.arkindustries.amezo.catalog.dto;

import com.arkindustries.amezo.catalog.ProductStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One row of the seller's products screen - the contract's SellerProductRow.
 *
 * Richer than SellerProductSummaryResponse, which the unversioned
 * GET /sellers/me/products still returns unchanged: the screen prints a price
 * range, a total stock figure, an image count and a status pill, and computing
 * those in the browser would mean fetching every variant and image of every
 * product to render a table of eight rows.
 *
 * productRef is the slug, because that is what /products/{productRef} resolves
 * and what a link to the buyer-facing page has to carry.
 *
 * priceFrom/priceTo are null - not 0 - for a product with no priced offer.
 * Zero is a real price, and a row that says "$0.00" for "we don't know" is a
 * worse answer than a row that says nothing.
 */
public record SellerProductRowResponse(
        UUID id,
        String productRef,
        String title,
        String brandName,
        String thumbnailUrl,
        int imageCount,
        CategoryResponse category,
        ProductStatus status,
        int variantCount,
        int totalStock,
        BigDecimal priceFrom,
        BigDecimal priceTo,
        Instant createdAt,
        Instant updatedAt
) {
}
