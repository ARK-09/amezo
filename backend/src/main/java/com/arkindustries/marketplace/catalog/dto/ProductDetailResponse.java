package com.arkindustries.marketplace.catalog.dto;

import java.util.List;
import java.util.UUID;

/**
 * Deliberately narrower than docs/api-design.md's original sketch: no
 * sellerId/sellerName here (not asked for in this pass, and it would add a
 * third cross-feature dependency on identity for a field nobody requested -
 * flagging the omission rather than silently matching the older spec).
 * Per-variant image lists from that same original sketch are also dropped;
 * this task asked for one top-level, product-scoped images list.
 */
public record ProductDetailResponse(
        UUID id,
        String title,
        String brandName,
        String category,
        String description,
        List<ImageResponse> images,
        List<VariantDetailResponse> variants,
        ReviewSummaryResponse reviewSummary
) {
}
