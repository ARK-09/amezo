package com.arkindustries.amezo.orders;

/**
 * The statuses an order row can actually hold, which is deliberately NARROWER
 * than the contract's OrderStatus enum.
 *
 * Missing on purpose, and each for its own reason:
 *
 * <ul>
 *   <li>REFUNDED is DERIVED, never stored. The refund request is the single
 *       source of it - see refunds.api.OrderRefundQuery.refundedOrderIds - and
 *       callers overlay it when they render a status. That is why the seller
 *       row's {@code status} is a String in the response rather than this enum:
 *       the wire vocabulary has a value this column cannot hold.</li>
 *   <li>IN_TRANSIT and OUT_FOR_DELIVERY are carrier states, and nothing in this
 *       system reports them: there is no carrier integration and no webhook. The
 *       "With Amezo" tab spans them because the design's tab does, and it
 *       honestly shows only SHIPPED until something can produce the other
 *       two.</li>
 * </ul>
 *
 * PACKED and CANCELLED arrived with V24, which is also where the reasoning for
 * each of the absences is recorded against the CHECK constraint that enforces
 * it.
 */
public enum OrderStatus {
    PLACED, PACKED, SHIPPED, DELIVERED, CANCELLED
}
