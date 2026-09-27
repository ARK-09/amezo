package com.arkindustries.amezo.refunds;

import java.util.EnumMap;
import java.util.Map;
import java.util.Set;

/**
 * The refund state machine, as data.
 *
 * Two questions, kept apart because they have different answers: which moves
 * exist at all ({@link #legalFrom}), and which of them this caller may make
 * ({@link #isLegal}). A buyer and a seller looking at the same REQUESTED row see
 * different options, so a single table of "allowed next states" could not be
 * correct for both.
 *
 * <h2>The graph</h2>
 *
 * <pre>
 *   REQUESTED ──approve, refund───────► AWAITING_RETURN ──► RETURN_RECEIVED ──► REFUNDED
 *       │ ──approve, replacement─────► APPROVED ──────────► REPLACEMENT_SENT
 *       │ ──decline (seller)─────────► DECLINED
 *       └ ──cancel  (buyer)──────────► CANCELLED
 *
 *   APPROVED, AWAITING_RETURN ──undo (seller)──► REQUESTED
 * </pre>
 *
 * <h2>Why APPROVED and AWAITING_RETURN are both reachable from REQUESTED</h2>
 *
 * The contract lists both as direct targets, and the two approvals genuinely
 * differ. Approving a REFUND asks for the item back, so the request lands where
 * the seller's queue calls it "Awaiting return"; approving a REPLACEMENT asks
 * for nothing back, so there is no return to wait for and it lands on APPROVED
 * with one step left. Collapsing them would either invent a return step for
 * replacements or leave every approved refund sitting in a bucket the design's
 * queue has no tab for.
 *
 * <h2>Why undo exists</h2>
 *
 * The Seller Refunds design puts "Undo approval" beside the release button on the
 * "Approved · waiting on the return" panel. An approval is a promise about money,
 * made from one screen, occasionally to the wrong request or for the wrong
 * amount, and the alternative to walking it back is a seller who must release a
 * refund they did not mean to approve. It is deliberately NOT available from
 * RETURN_RECEIVED: once the buyer has posted the item back, unwinding the
 * approval would strand it.
 *
 * <h2>Who may do what</h2>
 *
 * The buyer's only move is CANCELLED, and only while nobody has decided. Every
 * other transition is the owning seller's. Authorization of <em>which</em> buyer
 * and <em>which</em> seller is not here - that is ownership, checked when the
 * request is loaded (RefundRequestService) - this only answers "may an actor of
 * this kind make this move at all".
 */
public final class RefundTransitions {

    private RefundTransitions() {
    }

    /** Who is asking. The refund's two sides have different moves available. */
    public enum Actor {
        BUYER,
        SELLER
    }

    private static final Map<RefundStatus, Set<RefundStatus>> SELLER_MOVES =
            new EnumMap<>(Map.of(
                    RefundStatus.REQUESTED,
                    Set.of(RefundStatus.APPROVED, RefundStatus.AWAITING_RETURN, RefundStatus.DECLINED),
                    // REQUESTED is the undo. RETURN_RECEIVED is the fast path for a
                    // seller who had the item in their hand before they got round to
                    // the queue, which is why it is reachable without passing through
                    // AWAITING_RETURN.
                    RefundStatus.APPROVED,
                    Set.of(RefundStatus.AWAITING_RETURN, RefundStatus.RETURN_RECEIVED,
                            RefundStatus.REPLACEMENT_SENT, RefundStatus.REQUESTED),
                    RefundStatus.AWAITING_RETURN,
                    Set.of(RefundStatus.RETURN_RECEIVED, RefundStatus.REQUESTED),
                    RefundStatus.RETURN_RECEIVED,
                    Set.of(RefundStatus.REFUNDED, RefundStatus.REPLACEMENT_SENT)));

    private static final Map<RefundStatus, Set<RefundStatus>> BUYER_MOVES =
            new EnumMap<>(Map.of(RefundStatus.REQUESTED, Set.of(RefundStatus.CANCELLED)));

    /**
     * Every move that exists from this status, whoever makes it. Used to answer
     * "is this request still live" and nothing else - a caller deciding whether
     * to accept a transition must use {@link #isLegal}, which also knows who is
     * asking.
     */
    public static Set<RefundStatus> legalFrom(RefundStatus from) {
        Set<RefundStatus> seller = SELLER_MOVES.getOrDefault(from, Set.of());
        Set<RefundStatus> buyer = BUYER_MOVES.getOrDefault(from, Set.of());
        if (buyer.isEmpty()) {
            return seller;
        }
        EnumMap<RefundStatus, Boolean> union = new EnumMap<>(RefundStatus.class);
        seller.forEach(status -> union.put(status, true));
        buyer.forEach(status -> union.put(status, true));
        return union.keySet();
    }

    /** May an actor of this kind move a request from here to there? */
    public static boolean isLegal(Actor actor, RefundStatus from, RefundStatus to) {
        Map<RefundStatus, Set<RefundStatus>> moves =
                actor == Actor.SELLER ? SELLER_MOVES : BUYER_MOVES;
        return moves.getOrDefault(from, Set.of()).contains(to);
    }

    /**
     * True where this transition walks an approval back rather than moving the
     * request on. The service clears the approval's own fields on one - an amount
     * and a return label left behind would outlive the decision that set them.
     */
    public static boolean isUndo(RefundStatus from, RefundStatus to) {
        return to == RefundStatus.REQUESTED
                && (from == RefundStatus.APPROVED || from == RefundStatus.AWAITING_RETURN);
    }
}
