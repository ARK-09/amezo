package com.arkindustries.amezo.orders.dto;

import com.arkindustries.amezo.orders.OrderStatus;

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
 * TWO CONTRACT FIELDS ARE DELIBERATELY ABSENT rather than present-and-empty:
 *
 *  - `payment` (PaymentSummary: brand + last4). No payment is taken anywhere in
 *    this system and no card is stored, so both fields would have to be invented.
 *    Neither is in the contract's required list and the screen reads
 *    `order.payment &&`, so an absent field prints nothing.
 *  - `refundRequests` (RefundRequestSummary[]). Refunds are modelled once, by
 *    refund_request, with their own state machine - and giving this record a
 *    typed empty list would mean declaring RefundStatus and RefundResolution
 *    here, which is precisely the second refund model that must not exist. The
 *    screens read `order.refundRequests ?? []`. See BuyerOrderService for the one
 *    query the refund feature needs to expose, and the four fields that light up
 *    when it does.
 *
 * canRequestRefund IS present, as a real boolean: the screen tests it with
 * `=== false`, so an absent field would read as "yes, go ahead".
 */
public record BuyerOrderDetailResponse(
        UUID id,
        String reference,
        Instant placedAt,
        OrderStatus status,
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
        boolean canRequestRefund,
        Instant refundWindowEndsAt
) {
}
