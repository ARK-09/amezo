package com.arkindustries.amezo.orders.dto;

import com.arkindustries.amezo.orders.OrderStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The contract's BuyerOrderSummary - one card in the buyer's My Orders list.
 *
 * `status` is the Java OrderStatus, whose three values (PLACED, SHIPPED,
 * DELIVERED) are all members of the contract's eight-value enum, so this
 * serialises to something the client's generated type already accepts. It is
 * deliberately the enum and not a String: a status this backend cannot produce
 * should not be expressible here by accident.
 *
 * openRefundRequestId / openRefundStatus are null in every response today - the
 * refund_request table they read does not exist yet. See BuyerOrderService for
 * the one query the refund feature has to expose to light them up.
 */
public record BuyerOrderSummaryResponse(
        UUID id,
        String reference,
        Instant placedAt,
        OrderStatus status,
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
