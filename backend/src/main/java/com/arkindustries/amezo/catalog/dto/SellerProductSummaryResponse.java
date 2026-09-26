package com.arkindustries.amezo.catalog.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * slug is here so the portal's product list can link a seller to the buyer-facing
 * page their customers see, at the same URL. category is the {slug, name} pair for
 * the same reason it is everywhere else: the row prints the name, and an edit form
 * opened from it already holds the slug the selector needs.
 */
public record SellerProductSummaryResponse(
        UUID id,
        String slug,
        String title,
        String thumbnailUrl,
        CategoryResponse category,
        int variantCount,
        Instant createdAt
) {
}
