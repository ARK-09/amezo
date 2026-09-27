package com.arkindustries.amezo.refunds.api;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Everything another feature may know about an order's refunds. The only
 * cross-feature surface refunds exposes, alongside {@link RefundWindowPolicy}.
 *
 * <h2>This is how an order's REFUNDED status is derived</h2>
 *
 * REFUNDED is on OrderStatus so the order lists and their tabs can show it, but no
 * client may declare it: SellerOrderTransition is
 * {@code [PACKED, SHIPPED, CANCELLED]} and stays that way. The refund request is the
 * single source of that fact, and {@link #refundedOrderIds} is how it is read. An
 * order-level column a client could also set would be a second source of truth that
 * nothing reconciles the first time somebody settles a refund from the queue rather
 * than from the order.
 *
 * So a caller rendering an order's status overlays it:
 *
 * <pre>
 *   Set&lt;UUID&gt; refunded = orderRefundQuery.refundedOrderIds(orderIds);
 *   String status = refunded.contains(order.getId()) ? "REFUNDED" : order.getStatus().name();
 * </pre>
 *
 * Note that REPLACEMENT_SENT is settled but is deliberately NOT refunded: a
 * replacement moves a parcel, not money, and must leave the fulfilment status alone.
 *
 * <h2>{@link #refundsByOrderIds} is the one call that lights up the buyer's orders</h2>
 *
 * It is enough on its own for every refund field on an order, which is why it
 * returns a shape that carries the line ids as well as the summary fields:
 *
 * <ul>
 *   <li>{@code openRefundRequestId} / {@code openRefundStatus} per summary row - the
 *       snapshot whose {@code open()} is true (or {@link #openRefundByOrderId});
 *   <li>{@code refundRequestId} / {@code refundStatus} per LINE - match the line
 *       against {@code orderLineIds()};
 *   <li>{@code refundRequests} on the detail - the list itself;
 *   <li>the derived REFUNDED status - {@code refunded()}, or
 *       {@link #refundedOrderIds} for the set directly;
 *   <li>the Refunds facet bucket - whether any snapshot for that order is
 *       {@code open()};
 *   <li>the "no open request" half of {@code canRequestRefund} - see
 *       {@link #orderLineIdsUnderOpenRequest}, which answers it per line and is the
 *       precise form of the rule POST /api/v1/refund-requests enforces.
 * </ul>
 *
 * <h2>Batch first</h2>
 *
 * Every method that answers a question about several orders takes a collection,
 * because every caller is a list: the buyer's order list needs a badge per row and
 * the seller's needs {@code hasOpenRefund} per row. A page of ten orders is one
 * query, not ten. The single-order forms exist for the detail reads and are not the
 * shape a list should use.
 */
public interface OrderRefundQuery {

    /**
     * Every request raised against these orders, keyed by order id, oldest first.
     * Orders with no requests are absent rather than mapped to an empty list.
     *
     * The primary entry point - see the class note for the six things it answers.
     */
    Map<UUID, List<OrderRefundSnapshot>> refundsByOrderIds(Collection<UUID> orderIds);

    /** Every request raised against one order, oldest first. */
    List<OrderRefundSnapshot> refundsForOrder(UUID orderId);

    /**
     * Orders whose refund has been settled with money. The single source of an
     * order's derived REFUNDED status - see the class note.
     *
     * <p><strong>Flagged:</strong> a PARTIAL refund puts its order in this set,
     * exactly as docs/backend-handoff.md specifies. If that turns out to be wrong for
     * real data, this method is the one predicate to change, and the alternative is to
     * keep the fulfilment status and let the refund badge carry the partial alone.
     */
    Set<UUID> refundedOrderIds(Collection<UUID> orderIds);

    /** Orders with at least one still-live request: the seller list's hasOpenRefund. */
    Set<UUID> orderIdsWithOpenRefund(Collection<UUID> orderIds);

    /**
     * The one live request per order, for the buyer list's openRefundRequestId and
     * openRefundStatus. Orders with no live request are absent rather than mapped to
     * null.
     *
     * At most one can exist per order in practice, because every line of a request is
     * locked against a second open one (V21's partial unique index) - but where an
     * order's lines were split across two requests the newest is returned, which is
     * the one a badge should show.
     */
    Map<UUID, OrderRefundSnapshot> openRefundByOrderId(Collection<UUID> orderIds);

    /** One request by id, whoever it belongs to - the caller compares the owner. */
    Optional<OrderRefundSnapshot> findById(UUID refundRequestId);

    /**
     * Order lines already inside a live request, so a second one would be refused.
     *
     * This is the "no open request" half of an order's {@code canRequestRefund}; the
     * other half is the return window ({@link RefundWindowPolicy}). Both are here so
     * the flag the order detail publishes and the rule
     * POST /api/v1/refund-requests actually enforces cannot give different answers -
     * which is what "server-owned, no screen re-derives it" has to mean in practice.
     *
     * An order can still be refunded while SOME of its lines are locked, so the flag
     * is "not every line is under an open request", not "no line is".
     */
    Set<UUID> orderLineIdsUnderOpenRequest(Collection<UUID> orderLineIds);

    /**
     * Units of each order line already claimed by a request that has not been
     * released - open requests plus the ones settled with money or a replacement.
     * DECLINED and CANCELLED release their units and are excluded.
     *
     * A buyer refunded one of two units may come back for the other, and this is what
     * stops them coming back for three. It is the exact rule POST enforces, so an
     * order wanting a stricter {@code canRequestRefund} than "some line is still
     * free" can use it: a line is fully spoken for when its claimed quantity equals
     * its ordered quantity. Lines with nothing claimed are absent rather than mapped
     * to 0.
     */
    Map<UUID, Integer> claimedQuantityByOrderLineId(Collection<UUID> orderLineIds);
}
