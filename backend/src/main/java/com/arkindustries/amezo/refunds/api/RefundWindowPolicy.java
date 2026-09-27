package com.arkindustries.amezo.refunds.api;

import java.time.Instant;

/**
 * How long after an order a refund may still be raised against it.
 *
 * Exposed on the api package, rather than kept inside refunds, for one reason:
 * the contract puts {@code canRequestRefund} and {@code refundWindowEndsAt} on
 * the ORDER detail and calls them server-owned, while
 * POST /api/v1/refund-requests is what actually refuses a late request with a
 * 422. Those are two different features answering the same question, and the only
 * way they cannot disagree is to compute it in one place. This is that place.
 *
 * <h2>Flagged: the window is anchored to the order date, not the delivery date</h2>
 *
 * A return window should run from when the buyer received the goods, and
 * {@code orders.delivered_at} now exists (V26) - so the reason this is still anchored
 * to {@code placed_at} is no longer that nothing records delivery. It is that the
 * length of the window is a business rule and so is its anchor: the design mentions
 * "Outside the 30-day return window" only as a decline reason and names no anchor, and
 * moving it would silently lengthen every live window, including for orders whose
 * buyers have already been told when theirs ends.
 *
 * The consequence of leaving it is real and worth stating plainly: a slow delivery
 * eats into the buyer's window. Re-anchoring is a one-line change here, to take the
 * delivery timestamp where there is one and fall back to {@code placed_at} where
 * there is not - and it needs a decision, not an implementation.
 */
public interface RefundWindowPolicy {

    /** The moment after which no new request may be raised against this order. */
    Instant endsAt(Instant orderPlacedAt);

    /** Whether that moment is still ahead of us. */
    boolean isOpenAt(Instant orderPlacedAt, Instant now);
}
