package com.arkindustries.amezo.orders.api;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One line of an order, as a refund sees it.
 *
 * {@code sellerId} is the line's own seller_id_snapshot, not the order's
 * seller_id: that column is nullable and no longer set by checkout (see Order's
 * doc comment), because one order can hold lines from several sellers. A refund
 * is owed by whoever sold the line, so the snapshot is the only correct answer -
 * and it is why a request whose lines span two sellers is refused rather than
 * arbitrarily assigned to one of them.
 *
 * {@code unitPrice} is the purchase-time price. The refund's amount is built from
 * it, so that what is owed does not move when the catalogue does.
 */
public record OrderRefundLine(
        UUID orderLineId,
        UUID sellerId,
        UUID productId,
        UUID variantId,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal
) {
}
