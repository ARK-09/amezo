package com.arkindustries.amezo.refunds.dto;

import com.arkindustries.amezo.identity.api.StoreRef;
import com.arkindustries.amezo.refunds.RefundPayout;
import com.arkindustries.amezo.refunds.RefundResolution;
import com.arkindustries.amezo.refunds.RefundStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The contract's RefundRequestDetail: everything the seller's decision panel and
 * the buyer's own view of a request need, in one read.
 *
 * <h2>paymentMethod is always null, and that is correct</h2>
 *
 * The design's panel prints "Refund to Visa ending 4242". Checkout takes no
 * payment and stores no method - there is no payment table in this schema - so
 * there is nothing to put here. The contract types it nullable for exactly this
 * reason and the UI falls back to "Original payment method" rather than inventing a
 * card. Sending a plausible card number here would be the one lie this endpoint
 * could tell.
 *
 * <h2>requestedResolution alongside resolution</h2>
 *
 * Not in the contract, and sent anyway: the seller may settle a replacement
 * request with money, at which point {@code resolution} is REFUND and the fact
 * that the buyer asked for a parcel is only recoverable from this field. The panel
 * prints "Wants ..." from it.
 */
public record RefundRequestDetailResponse(
        UUID id,
        String reference,
        RefundStatus status,
        RefundResolution resolution,

        /** What the buyer originally asked for, which the seller's answer may differ from. */
        RefundResolution requestedResolution,

        RefundPayout payout,
        String detail,
        Instant requestedAt,
        BigDecimal requestedAmount,
        BigDecimal approvedAmount,
        String currency,
        UUID orderId,
        String orderReference,
        Instant orderPlacedAt,
        String buyerName,
        String buyerEmail,
        StoreRef seller,

        /** Always null: nothing in this codebase captures how an order was paid. */
        String paymentMethod,

        List<RefundRequestLineResponse> lines,

        /** Oldest first, as the History timeline reads. */
        List<RefundEventResponse> events,

        Instant approvedAt,
        Instant declinedAt,
        String declineReason,
        Instant returnReceivedAt,
        Instant refundedAt,
        Instant replacementSentAt,
        String returnTrackingNumber
) {
}
