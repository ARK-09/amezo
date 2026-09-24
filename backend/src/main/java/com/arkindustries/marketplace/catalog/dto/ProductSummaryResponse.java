package com.arkindustries.marketplace.catalog.dto;

import java.util.UUID;

/**
 * Deliberately minimal - this is the scaffold's one proving endpoint, not
 * the full GET /products from docs/api-design.md (which adds category,
 * price range, warranty/stock filters, sort, and aggregated priceFrom /
 * avgRating). Those require joining variant/offer/review data, which is
 * business logic out of scope for this pass.
 */
public record ProductSummaryResponse(
        UUID id,
        String title,
        String brandName,
        String category
) {
}
