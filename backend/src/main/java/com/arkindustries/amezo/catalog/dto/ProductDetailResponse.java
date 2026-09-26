package com.arkindustries.amezo.catalog.dto;

import java.util.List;
import java.util.UUID;

/**
 * sellerId is now included - the Add-to-cart button has to know whether the
 * signed-in seller is looking at their own listing. It is the product's own
 * seller_id column, so this adds no cross-feature dependency on identity;
 * sellerName still isn't here, and would.
 *
 * slug travels alongside id because the page is reached by slug and the id is
 * still what the cart, the reviews and the images are keyed by internally.
 *
 * Per-variant image lists from docs/api-design.md's original sketch remain
 * dropped; this API has one top-level, product-scoped images list.
 */
public record ProductDetailResponse(
        UUID id,
        String slug,
        UUID sellerId,
        String title,
        String brandName,
        CategoryResponse category,
        String description,
        List<ImageResponse> images,
        List<VariantDetailResponse> variants,
        ReviewSummaryResponse reviewSummary
) {
}
