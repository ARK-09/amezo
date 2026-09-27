package com.arkindustries.amezo.refunds;

import java.util.Set;

/**
 * Where a refund request is, and the whole of the state machine's vocabulary.
 * All eight values of the contract's RefundStatus (frontend/openapi/fixture.yaml).
 *
 * The transitions live on {@link RefundTransitions}, not here: a status is a
 * value, and which move is legal from it depends on who is asking and on the
 * resolution, neither of which an enum constant can see.
 */
public enum RefundStatus {

    /** The buyer has raised it and nobody has decided anything. */
    REQUESTED,

    /**
     * The seller said yes. Distinct from AWAITING_RETURN because a REPLACEMENT is
     * approved without asking for anything back - there is nothing to wait for,
     * only a parcel to send.
     */
    APPROVED,

    /** Approved, and the item has to come back before money is released. */
    AWAITING_RETURN,

    /** The item is back. The last step before the money moves. */
    RETURN_RECEIVED,

    /** Settled with money. The one status an order's derived REFUNDED reads. */
    REFUNDED,

    /** Settled with a parcel instead of money. Not a refund - see OrderRefundQuery. */
    REPLACEMENT_SENT,

    /** The seller said no, with a reason. */
    DECLINED,

    /** The buyer withdrew it before anyone decided. */
    CANCELLED;

    /**
     * Settled one way or another: nothing moves out of these, and nothing about
     * the order they belong to is still pending on them.
     *
     * "Open" everywhere else in this feature is the complement of this set,
     * derived rather than listed a second time - the two cannot drift apart that
     * way.
     */
    public static final Set<RefundStatus> TERMINAL =
            Set.of(REFUNDED, REPLACEMENT_SENT, DECLINED, CANCELLED);

    public boolean isTerminal() {
        return TERMINAL.contains(this);
    }

    public boolean isOpen() {
        return !isTerminal();
    }
}
