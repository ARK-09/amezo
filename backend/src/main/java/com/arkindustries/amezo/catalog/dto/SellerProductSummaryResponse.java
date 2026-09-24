package com.arkindustries.amezo.catalog.dto;

import java.time.Instant;
import java.util.UUID;

public record SellerProductSummaryResponse(
        UUID id,
        String title,
        String thumbnailUrl,
        String category,
        int variantCount,
        Instant createdAt
) {
}
