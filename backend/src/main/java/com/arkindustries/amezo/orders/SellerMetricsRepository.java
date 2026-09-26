package com.arkindustries.amezo.orders;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The seller dashboard's read model over order_line.
 *
 * A repository of its own rather than four more methods on OrderLineRepository:
 * nothing here loads an OrderLine, every method is a grouped aggregate, and the
 * two have no query in common. Keeping them apart also keeps the write path's
 * repository free of reporting SQL nobody editing an order needs to read.
 *
 * Ownership is ALWAYS order_line.seller_id_snapshot and never orders.seller_id.
 * V12 relaxed that column to nullable and checkout stopped setting it, so a real
 * order has seller_id IS NULL and one order can carry several sellers' lines -
 * see SellerOrderService's class comment. A join to orders here would silently
 * report nothing.
 *
 * Native SQL rather than JPQL for a reason that is not performance: the day /
 * week / month buckets need date_trunc, which JPQL cannot express, and the
 * previous-window comparison needs a LEFT JOIN between two aggregates, which
 * JPQL cannot express either (it has no derived tables). Splitting those into
 * per-row queries in Java is how a dashboard becomes N+1.
 *
 * Every window is a half-open interval [from, toExclusive). Half-open is what
 * makes "the day the window ends on" whole without an off-by-one: the caller
 * passes midnight after the last day, so a sale at 23:59:59 on the last day
 * counts and the first instant of the next day does not.
 */
public interface SellerMetricsRepository extends Repository<OrderLine, UUID> {

    /**
     * One row, always - an aggregate with no GROUP BY returns a row even over no
     * data. lineCount is what tells the two apart: 0 means nothing was measured
     * in this window, and revenue comes back null rather than zero, which is the
     * distinction the previous-window totals depend on.
     */
    interface WindowTotals {
        long getLineCount();

        /**
         * Distinct orders, not lines. A basket holding three of a seller's
         * products is one order to that seller, and counting lines would report
         * three - which is also what the average order value would then be
         * divided by.
         */
        long getOrderCount();

        /** Null when lineCount is 0: SUM over no rows is null, and it is left that way. */
        BigDecimal getRevenue();

        /** Null when lineCount is 0, for the same reason. */
        Long getUnits();
    }

    interface SeriesPoint {
        /** The bucket's first day, as YYYY-MM-DD. */
        String getBucket();

        long getOrderCount();

        BigDecimal getRevenue();
    }

    interface ProductTotals {
        UUID getProductId();

        BigDecimal getRevenue();

        long getUnits();
    }

    interface RankedProduct extends ProductTotals {
        /**
         * The same product's revenue in the window immediately before this one.
         *
         * NULL when that window holds no line for the product at all - the LEFT
         * JOIN below is what produces it, and it is never coalesced to zero. A
         * product that sold nothing then and a product whose price was zero then
         * are different facts, and the dashboard renders them differently ("No
         * prior data" against "New" - see changeVsPrevious.ts).
         */
        BigDecimal getPreviousRevenue();
    }

    @Query(value = """
            SELECT COUNT(*)                                            AS "lineCount",
                   COUNT(DISTINCT ol.order_id)                         AS "orderCount",
                   SUM(ol.unit_price_snapshot * ol.quantity)           AS "revenue",
                   SUM(ol.quantity)                                    AS "units"
            FROM order_line ol
            WHERE ol.seller_id_snapshot = :sellerId
              AND ol.created_at >= :from
              AND ol.created_at < :toExclusive
            """, nativeQuery = true)
    WindowTotals windowTotals(
            @Param("sellerId") UUID sellerId,
            @Param("from") Instant from,
            @Param("toExclusive") Instant toExclusive);

    /**
     * Only the buckets that have sales. Filling the gaps is the service's job:
     * SQL cannot invent the empty days without a generate_series the caller
     * would have to parameterise anyway, and the series has to be complete
     * before it reaches a chart.
     *
     * created_at AT TIME ZONE 'UTC' fixes the calendar the buckets are cut on.
     * Without it the boundary would follow whatever time zone the database
     * session happens to carry, and the same window would return different
     * numbers on two machines.
     */
    @Query(value = """
            SELECT to_char(date_trunc(CAST(:unit AS text), ol.created_at AT TIME ZONE 'UTC'),
                           'YYYY-MM-DD')                               AS "bucket",
                   COUNT(DISTINCT ol.order_id)                         AS "orderCount",
                   SUM(ol.unit_price_snapshot * ol.quantity)           AS "revenue"
            FROM order_line ol
            WHERE ol.seller_id_snapshot = :sellerId
              AND ol.created_at >= :from
              AND ol.created_at < :toExclusive
            GROUP BY 1
            ORDER BY 1
            """, nativeQuery = true)
    List<SeriesPoint> series(
            @Param("sellerId") UUID sellerId,
            @Param("from") Instant from,
            @Param("toExclusive") Instant toExclusive,
            @Param("unit") String unit);

    /**
     * The window's best sellers by revenue, each with what it made in the window
     * before. One query, not one plus N: the previous-window figure arrives on
     * the same row through the LEFT JOIN.
     *
     * The tie-break on product_id_snapshot is not decoration - without it two
     * products on identical revenue can swap places between two calls with the
     * same arguments, and a "top 5" would quietly hold a different fifth row
     * each refresh.
     */
    @Query(value = """
            SELECT cur.product_id_snapshot                             AS "productId",
                   cur.revenue                                         AS "revenue",
                   cur.units                                           AS "units",
                   prev.revenue                                        AS "previousRevenue"
            FROM (SELECT ol.product_id_snapshot,
                         SUM(ol.unit_price_snapshot * ol.quantity) AS revenue,
                         SUM(ol.quantity)                          AS units
                  FROM order_line ol
                  WHERE ol.seller_id_snapshot = :sellerId
                    AND ol.created_at >= :from
                    AND ol.created_at < :toExclusive
                  GROUP BY ol.product_id_snapshot) cur
            LEFT JOIN (SELECT ol.product_id_snapshot,
                              SUM(ol.unit_price_snapshot * ol.quantity) AS revenue
                       FROM order_line ol
                       WHERE ol.seller_id_snapshot = :sellerId
                         AND ol.created_at >= :previousFrom
                         AND ol.created_at < :from
                       GROUP BY ol.product_id_snapshot) prev
                   ON prev.product_id_snapshot = cur.product_id_snapshot
            ORDER BY cur.revenue DESC, cur.product_id_snapshot
            LIMIT :limit
            """, nativeQuery = true)
    List<RankedProduct> topProducts(
            @Param("sellerId") UUID sellerId,
            @Param("from") Instant from,
            @Param("toExclusive") Instant toExclusive,
            @Param("previousFrom") Instant previousFrom,
            @Param("limit") int limit);

    /**
     * Revenue and units per product for the whole window, uncapped.
     *
     * The category breakdown is built on top of this rather than in SQL: which
     * category a product belongs to is catalog's fact, not orders', and
     * order_line holds only a product-id snapshot. Grouping happens in the
     * service, after catalog has been asked - a join to the product table from
     * here would reach straight through the feature boundary PackageBoundaryTest
     * guards.
     */
    @Query(value = """
            SELECT ol.product_id_snapshot                              AS "productId",
                   SUM(ol.unit_price_snapshot * ol.quantity)           AS "revenue",
                   SUM(ol.quantity)                                    AS "units"
            FROM order_line ol
            WHERE ol.seller_id_snapshot = :sellerId
              AND ol.created_at >= :from
              AND ol.created_at < :toExclusive
            GROUP BY ol.product_id_snapshot
            """, nativeQuery = true)
    List<ProductTotals> productTotals(
            @Param("sellerId") UUID sellerId,
            @Param("from") Instant from,
            @Param("toExclusive") Instant toExclusive);
}
