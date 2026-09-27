package com.arkindustries.amezo.orders.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One order, reduced to what deciding a refund against it needs: who it belongs
 * to, when it was placed, what it came to, and the lines that could be sent back.
 *
 * Deliberately not the Order entity. refunds has no business reading shipping or
 * billing addresses, the phone number, the tracking number or the fulfilment
 * status, and PackageBoundaryTest fails the build if it tries.
 *
 * {@code total} is the sum of every line on the order, across every seller on it.
 * A refund's own amount is built from the SELECTED lines, not from this - the
 * total is here so the over-refund guard has the order-level ceiling the brief
 * asks for as well as the per-request one.
 */
public record OrderRefundContext(
        UUID orderId,
        UUID buyerIdentityId,
        String buyerEmail,
        Instant placedAt,
        BigDecimal total,
        List<OrderRefundLine> lines
) {
}
