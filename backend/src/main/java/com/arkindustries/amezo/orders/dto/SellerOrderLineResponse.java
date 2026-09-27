package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One line of the seller's order drawer - the contract's SellerOrderLine.
 *
 * {@code productRef} is the slug a link is built from, and is null when the
 * product is gone for good: a link to nothing is worse than no link, and the screen
 * can tell the two apart. Distinct from OrderLineResponse, which the older
 * unversioned endpoint returns and which carries no ref or sku.
 */
public record SellerOrderLineResponse(
        UUID id,
        String productRef,
        String productTitle,
        String variantLabel,
        String sku,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal
) {
}
