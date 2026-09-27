package com.arkindustries.amezo.refunds.dto;

import com.arkindustries.amezo.refunds.RefundResolution;
import com.arkindustries.amezo.refunds.RefundStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * The contract's RefundRequestSummary - one row of the seller's queue or of the
 * buyer's list, and the shape an order's {@code refundRequests} array carries.
 *
 * {@code buyerName}, {@code buyerEmail} and {@code items} are not in the contract's
 * required set but the Seller Refunds design's table prints all three in its Buyer
 * and Items columns, so they are sent - a row that could not name the buyer would
 * be a table of reference codes.
 */
public record RefundRequestSummaryResponse(
        UUID id,
        String reference,
        RefundStatus status,
        RefundResolution resolution,
        Instant requestedAt,
        BigDecimal requestedAmount,
        BigDecimal approvedAmount,
        String currency,
        UUID orderId,
        String orderReference,
        String returnTrackingNumber,
        String buyerName,
        String buyerEmail,

        /** "2 × Aurora One Wireless Headphones, 1 × Travel Case" - the Items column. */
        String items
) {
}
