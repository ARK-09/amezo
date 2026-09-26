package com.arkindustries.amezo.orders.api;

import java.util.Optional;
import java.util.UUID;

/**
 * "Did this person actually buy this?" - the question reviews has to answer
 * before accepting one, and the only part of the order history it may see.
 *
 * Purchases are read from the order line's snapshots (product_id_snapshot,
 * variant_id_snapshot), not from live catalog state: what matters is what was
 * bought at the time, and a product that has since been edited is still a
 * purchase.
 */
public interface OrderLinePurchaseQuery {

    /** The line, whoever it belongs to. The caller compares the buyer itself. */
    Optional<PurchasedLine> findLine(UUID orderLineId);

    /**
     * Any line on which this buyer bought this product, oldest first, so a
     * repeat buyer's review is attached to their first purchase and the answer
     * doesn't move between calls.
     */
    Optional<PurchasedLine> findPurchase(UUID buyerIdentityId, UUID productId);
}
