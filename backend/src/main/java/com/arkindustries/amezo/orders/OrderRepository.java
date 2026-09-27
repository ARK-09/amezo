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

    // No findBySellerId(...): Order.sellerId is nullable and unset by
    // checkout (see Order's doc comment) - order_line.sellerIdSnapshot via
    // OrderLineRepository.findBySellerIdSnapshot is the only reliable way
    // to find a seller's orders. See SellerOrderService.
}
