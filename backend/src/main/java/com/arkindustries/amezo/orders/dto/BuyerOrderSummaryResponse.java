package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The contract's BuyerOrderSummary - one card in the buyer's My Orders list.
 *
 * {@code status} is a String, not OrderStatus - the same choice
 * SellerOrderRowResponse makes, and for the same reason. The wire vocabulary has
 * REFUNDED and OrderStatus deliberately does not: it is derived from the order's
 * refund request rather than stored (see refunds.api.OrderRefundQuery), so the value
 * this row reports is not always a constant the enum has. Typing it as the enum is
 * what used to make a refunded order report DELIVERED to the buyer while the seller
 * looking at the same order was shown REFUNDED.
 *
 * {@code openRefundRequestId} / {@code openRefundStatus} carry the LATEST request
 * against the order, settled ones included - not only a live one. The card prints a
 * badge from them and "a refund that has been approved or declined does not read
 * the same as one nobody has looked at yet"; whether it is still running is
 * something the status answers, and the screen asks that question itself.
 */
public record BuyerOrderSummaryResponse(
        UUID id,
        String reference,
        Instant placedAt,
        String status,
        BigDecimal total,
        String currency,
        int itemCount,
        StoreRefResponse seller,
        List<BuyerOrderLineResponse> previewLines,
        ShipmentInfoResponse shipment,
        UUID openRefundRequestId,
        String openRefundStatus
) {
}
