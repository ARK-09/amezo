package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The contract's BuyerOrderDetail - what the expanded order card shows.
 *
 * Three of its money fields have no column behind them, and this is the place to
 * say so plainly:
 *
 *  - subtotal is real: the sum of every line's unit_price_snapshot x quantity.
 *  - shipping and tax are ZERO, not null, because the contract requires them as
 *    numbers. Nothing in the schema charges for postage or computes tax - no rate
 *    table, no nexus, no carrier price - so zero is the truthful total of what
 *    this marketplace actually adds on top, not a placeholder standing in for a
 *    number that exists somewhere else.
 *  - total therefore equals subtotal. It stays its own field rather than becoming
 *    an alias, so the day postage or tax becomes real, total stops matching
 *    subtotal without any client changing.
 *
 * billingAddress is returned only when it actually differs from shipping (see
 * BuyerOrderService): the billing columns are NOT NULL and hold a copy of
 * shipping when billing_same_as_shipping is set, and echoing that copy back would
 * have every screen print the same address twice.
 *
 * ONE CONTRACT FIELD IS DELIBERATELY ABSENT rather than present-and-empty:
 * `payment` (PaymentSummary: brand + last4). No payment is taken anywhere in this
 * system and no card is stored, so both fields would have to be invented. It is not
 * in the contract's required list and the screen reads `order.payment &&`, so an
 * absent field prints nothing.
 *
 * `refundRequests` IS here now. It carries every request raised against the order,
 * oldest first, as OrderRefundSummaryResponse - the shape the seller's own order
 * detail already publishes, so both sides of a refund read one description of it.
 * Refunds stay modelled once, by refund_request: this list is assembled from
 * refunds.api.OrderRefundSnapshot and nothing here stores or infers refund state.
 *
 * {@code status} is a String for the reason BuyerOrderSummaryResponse gives:
 * REFUNDED is derived and OrderStatus has no such constant.
 *
 * canRequestRefund IS present, as a real boolean: the screen tests it with
 * `=== false`, so an absent field would read as "yes, go ahead".
 */
public record BuyerOrderDetailResponse(
        UUID id,
        String reference,
        Instant placedAt,
        String status,
        StoreRefResponse seller,
        List<BuyerOrderLineResponse> lines,
        BigDecimal subtotal,
        BigDecimal shipping,
        BigDecimal tax,
        BigDecimal total,
        String currency,
        List<OrderTimelineEntryResponse> timeline,
        ShipmentInfoResponse shipment,
        AddressResponse shippingAddress,
        AddressResponse billingAddress,
        List<OrderRefundSummaryResponse> refundRequests,
        boolean canRequestRefund,
        Instant refundWindowEndsAt
) {
}
