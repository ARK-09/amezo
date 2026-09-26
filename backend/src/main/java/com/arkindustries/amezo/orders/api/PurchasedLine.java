package com.arkindustries.amezo.orders.api;

import java.util.UUID;

/**
 * Proof that one buyer bought one product, reduced to what a reviewer check
 * needs: whose purchase it was, what was bought, and the line it was bought on.
 * Deliberately not the OrderLine entity - reviews has no business reading order
 * status, prices or addresses.
 */
public record PurchasedLine(
        UUID orderLineId,
        UUID buyerIdentityId,
        UUID productId,
        UUID variantId
) {
}
