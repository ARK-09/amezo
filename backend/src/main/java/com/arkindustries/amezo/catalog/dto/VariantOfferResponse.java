package com.arkindustries.amezo.catalog.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One cart line's live data. The cart itself lives in the browser (it stores
 * variant ids and quantities), so this is what the drawer re-fetches on open to
 * price those lines against the catalog rather than trusting whatever was stored
 * when the item was added - price changes and stock-outs show up here.
 */
public record VariantOfferResponse(
        UUID id,
        UUID productId,
        String productTitle,
        String variantLabel,
        String thumbnailUrl,
        BigDecimal price,
        int stockQty
) {
}
