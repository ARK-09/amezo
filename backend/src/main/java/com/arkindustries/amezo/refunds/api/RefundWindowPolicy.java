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
 * A return window should run from when the buyer received the goods. Nothing in
 * this schema records that: {@code orders} has {@code placed_at} and
 * {@code shipped_at} and no delivered_at, and OrderStatus.DELIVERED carries no
 * timestamp of its own. The design mentions "Outside the 30-day return window"
 * only as a decline reason, and names no anchor.
 *
 * So the window runs from {@code placed_at}, which is the only timestamp that
 * exists on every order. The consequence is real and worth stating: a slow
 * delivery eats into the buyer's window. Once a delivery timestamp is recorded,
 * this class is the single line to change.
 */
public interface RefundWindowPolicy {

    /** The moment after which no new request may be raised against this order. */
    Instant endsAt(Instant orderPlacedAt);

    /** Whether that moment is still ahead of us. */
    boolean isOpenAt(Instant orderPlacedAt, Instant now);
}
