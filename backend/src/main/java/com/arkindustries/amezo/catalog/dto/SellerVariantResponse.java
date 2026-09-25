package com.arkindustries.amezo.catalog.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A variant as its own seller sees it: exact stock rather than the buyer-facing
 * inStock flag, because the number is what a seller edits.
 */
public record SellerVariantResponse(
        UUID id,
        String label,
        String sku,
        BigDecimal price,
        int stockQty
) {
}
