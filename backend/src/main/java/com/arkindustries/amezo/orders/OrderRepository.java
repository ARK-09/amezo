package com.arkindustries.amezo.orders;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    List<Order> findByBuyerIdentityId(UUID buyerIdentityId);

    /**
     * The buyer's most recent order, for prefilling checkout. Ordered by placedAt
     * rather than by id: the id is a random UUID, so "the latest row" is not a
     * thing the primary key can tell you.
     */
    Optional<Order> findFirstByBuyerIdentityIdOrderByPlacedAtDesc(UUID buyerIdentityId);

    /**
     * The buyer's own orders inside an optional date window, newest first -
     * everything GET /api/v1/orders and GET /api/v1/orders/facets can narrow in
     * the database.
     *
     * buyer_identity_id is the ONLY ownership column that means anything here.
     * orders.seller_id was relaxed to nullable by V12 and checkout stopped
     * setting it, so it answers nothing; see Order's own doc comment.
     *
     * The two other filters the contract declares are absent on purpose and not
     * by omission. `group` spans statuses the Java enum does not have yet
     * (BuyerOrderGroup) and, for its Refunds bucket, a table that does not
     * exist. `q` matches product titles, which live in catalog - a feature this
     * one may not join to at all (PackageBoundaryTest), only ask through
     * catalog.api. Both are therefore applied after this query, over a set this
     * one has already cut down to one buyer and one window. See
     * BuyerOrderService.
     *
     * NATIVE, with explicit CASTs, for the same reason every nullable filter in
     * ProductRepository is: a bare `:param IS NULL` gives Postgres nothing to
     * infer the parameter's type from, and it refuses the statement outright with
     * "could not determine data type of parameter $2". The cast is what names the
     * type, and naming it on both the null check and the comparison is what keeps
     * the two halves of the predicate talking about the same thing. HQL would
     * need the same cast spelled differently; native keeps this file speaking the
     * one dialect the CASTs are written in.
     *
     * SELECT * maps back onto Order by column name, embedded addresses included,
     * so a column the entity gains is picked up without editing this query.
     *
     * placedBefore is EXCLUSIVE. The contract's `from`/`to` are plain dates and
     * placed_at is a TIMESTAMPTZ, so an inclusive upper bound would have to be
     * "the last instant of that day" - a value with a rounding error built in.
     * BuyerOrderService passes the start of the following day instead.
     *
     * Tie-broken by id: placed_at defaults to now(), a bulk insert can hand two
     * orders the same one, and a page boundary falling inside a tie shows one
     * order on both pages and another on neither.
     */
    @Query(value = "SELECT * FROM orders o "
            + "WHERE o.buyer_identity_id = :buyerIdentityId "
            + "  AND (CAST(:placedFrom AS timestamptz) IS NULL "
            + "       OR o.placed_at >= CAST(:placedFrom AS timestamptz)) "
            + "  AND (CAST(:placedBefore AS timestamptz) IS NULL "
            + "       OR o.placed_at < CAST(:placedBefore AS timestamptz)) "
            + "ORDER BY o.placed_at DESC, o.id DESC",
            nativeQuery = true)
    List<Order> findForBuyerInWindow(
            @Param("buyerIdentityId") UUID buyerIdentityId,
            @Param("placedFrom") Instant placedFrom,
            @Param("placedBefore") Instant placedBefore);

    /**
     * Every order this seller has a line on, newest first - the seller's queue.
     *
     * Joined through order_line rather than filtered on orders.seller_id, because
     * that column is nullable and unset by checkout (see Order's doc comment):
     * order_line.seller_id_snapshot is the only reliable owner, per line. DISTINCT
     * because a seller with two lines on one order has one order in their queue.
     *
     * JPQL with an explicit join condition rather than a derived name, matching
     * OrderLineRepository.findPurchases: order_line has no mapped association to
     * orders - both sides are plain id columns by design - so there is no property
     * path for Spring Data to derive from.
     *
     * Deliberately unpaged and unfiltered. `group` and the REFUNDED status both need
     * the refund request, which lives in another feature and arrives as a batched
     * answer after the rows do; a facet count narrowed by the tab being viewed would
     * report zero for every other tab; and the order reference `q` searches is
     * derived from the id rather than stored, so matching it is a computation and not
     * a column comparison (see OrderReferences). So
     * SellerOrderRowService loads the queue once and filters, sorts and pages it -
     * bounded by ONE SELLER'S OWN ORDERS, the same judgement call, with the same
     * caveat, as BuyerOrderService. Said plainly so that the day a shop with a
     * hundred thousand orders exists, this paragraph is where the fix starts.
     *
     * Tie-broken by id: placed_at defaults to now(), a bulk insert can hand two
     * orders the same one, and a page boundary falling inside a tie would show one
     * order on both pages and another on neither.
     */
    @Query("SELECT DISTINCT o FROM Order o, OrderLine ol "
            + "WHERE ol.orderId = o.id AND ol.sellerIdSnapshot = :sellerId "
            + "ORDER BY o.placedAt DESC, o.id DESC")
    List<Order> findForSeller(@Param("sellerId") UUID sellerId);
}
