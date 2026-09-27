package com.arkindustries.amezo.refunds.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One refund request, as an ORDER sees it: the contract's RefundRequestSummary
 * fields plus the two things a caller would otherwise have to re-derive - whether
 * the request is still open, and which of the order's lines it covers.
 *
 * <h2>Why status and resolution are Strings</h2>
 *
 * RefundStatus and RefundResolution are refunds' own enums and live outside
 * {@code refunds.api}, so no other feature may import them - PackageBoundaryTest
 * fails the build on it. Promoting them into the api package would make every value
 * of the state machine part of the cross-feature surface, when what callers actually
 * need is the string the JSON carries.
 *
 * This follows the precedent already set by orders.api.OpenOrderLine, whose
 * {@code status} is the order's status as a String for the identical reason.
 * {@link #open} and {@link #refunded} are supplied as booleans so that no caller has
 * to reimplement a rule from that string, which is the mistake stringly-typed
 * statuses usually invite.
 */
public record OrderRefundSnapshot(
        UUID id,
        String reference,
        UUID orderId,

        /** A RefundStatus name: REQUESTED, APPROVED, AWAITING_RETURN, ... */
        String status,

        /**
         * A RefundResolution name: REFUND or REPLACEMENT. What the request is being
         * SETTLED as, which the seller may have changed from what the buyer asked.
         */
        String resolution,

        Instant requestedAt,
        BigDecimal requestedAmount,

        /** Null until the seller decides. Less than requested on a partial refund. */
        BigDecimal approvedAmount,

        String currency,

        /** Null unless the seller supplied one - this platform never mints one. */
        String returnTrackingNumber,

        /**
         * Still live: not settled one way or another. The complement of refunds' own
         * terminal set ({@code REFUNDED, REPLACEMENT_SENT, DECLINED, CANCELLED}),
         * computed there so no caller reimplements it.
         *
         * This is what an order's {@code openRefundRequestId} /
         * {@code openRefundStatus} and the seller list's {@code hasOpenRefund} read.
         */
        boolean open,

        /**
         * Settled WITH MONEY. This, and only this, is what an order's derived
         * REFUNDED status reads - a REPLACEMENT_SENT is settled but is not a refund,
         * and must leave the fulfilment status alone.
         */
        boolean refunded,

        /**
         * The order lines this request covers, in the order they were requested.
         *
         * Here because the buyer's order detail tags each LINE with the request it
         * sits inside ({@code refundRequestId} / {@code refundStatus} per line, and
         * the design's "IN REFUND" chip). A request is not necessarily the whole
         * order - the buyer's form is a checklist - so a caller cannot assume every
         * line of the order is covered, and without these ids it would have to guess
         * or ask per line.
         */
        List<UUID> orderLineIds
) {
}
