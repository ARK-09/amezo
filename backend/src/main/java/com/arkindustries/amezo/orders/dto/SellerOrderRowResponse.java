package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One row of the Seller Orders table - the contract's SellerOrderRow.
 *
 * {@code status} is a String, not OrderStatus. The wire vocabulary has REFUNDED
 * and OrderStatus deliberately does not: it is derived from the order's refund
 * request rather than stored (see refunds.api.OrderRefundQuery), so the value this
 * row reports is not always a constant the enum has.
 *
 * {@code total} and {@code itemCount} are THIS SELLER'S share of the order, not
 * the order's. One order can hold lines from several sellers - checkout creates one
 * order per call regardless (see Order's doc comment) - and showing a seller a
 * total that includes somebody else's goods would be wrong in the one place a
 * seller is most likely to check it.
 *
 * No trackingNumber: the seller's table has no tracking column, and a second copy
 * beside SellerOrderRowDetail's shipment is how three shapes of the same order
 * drifted apart before.
 */
public record SellerOrderRowResponse(
        UUID id,
        String reference,
        String buyerEmail,
        String recipientName,
        Instant placedAt,
        String status,
        int itemCount,
        BigDecimal total,
        String currency,
        String destination,
        boolean hasOpenRefund
) {
}
