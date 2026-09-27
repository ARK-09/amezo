package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A refund request as an ORDER shows it - the contract's RefundRequestSummary,
 * assembled from refunds.api.OrderRefundSnapshot plus the four fields the order
 * itself already knows (its own reference, the buyer, and the items).
 *
 * Declared here rather than reused from refunds.dto because a feature's DTOs are
 * its internals: PackageBoundaryTest fails the build on importing them, and
 * refunds' own summary is built for the refund queue's table, not for an order.
 *
 * status and resolution are Strings, matching the snapshot they come from -
 * RefundStatus and RefundResolution are refunds' enums and live outside its api
 * package on purpose.
 */
public record OrderRefundSummaryResponse(
        UUID id,
        String reference,
        String status,
        String resolution,
        Instant requestedAt,
        BigDecimal requestedAmount,
        BigDecimal approvedAmount,
        String currency,
        UUID orderId,
        String orderReference,
        String returnTrackingNumber,
        String buyerName,
        String buyerEmail,
        String items
) {
}
