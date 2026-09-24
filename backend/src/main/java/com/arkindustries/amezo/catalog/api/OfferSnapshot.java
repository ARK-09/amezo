package com.arkindustries.amezo.catalog.api;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Everything checkout needs to validate and snapshot one cart line,
 * assembled from offer + variant + product - the join a checkout line
 * actually needs, not a raw entity from any one of those tables.
 */
public record OfferSnapshot(
        UUID offerId,
        UUID variantId,
        UUID productId,
        UUID sellerId,
        String productTitle,
        String variantLabel,
        BigDecimal price,
        int stockQty
) {
}
