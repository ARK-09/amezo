package com.arkindustries.amezo.orders;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Sales aggregates over order_line, for the merchandising rankings orders publishes
 * through {@link com.arkindustries.amezo.orders.api.ProductSalesQuery} and
 * {@link com.arkindustries.amezo.orders.api.SellerSalesQuery}.
 *
 * A second repository over OrderLine rather than more methods on
 * {@link OrderLineRepository}, because that one is the feature's own row access and
 * this is an aggregate nothing inside orders reads. Keeping them apart means a
 * change to how the storefront ranks products or stores cannot disturb checkout.
 */
interface SalesRankingRepository extends JpaRepository<OrderLine, UUID> {

    /**
     * Units sold per product, most first.
     *
     * The tie-break on product_id_snapshot is load-bearing: without it, two products
     * on identical sales can swap places between two identical calls, and a rail's
     * last tile changes on every refresh.
     *
     * Counts every line regardless of the order's status. A cancelled order arguably
     * should not count towards "best selling" - but cancellations here restore stock
     * and are rare, and excluding them means joining orders and deciding what a
     * refunded-but-delivered sale means. Flagged rather than silently assumed: if
     * this ranking ever looks wrong, this is the WHERE clause to revisit.
     */
    @Query(value = """
            SELECT ol.product_id_snapshot
            FROM order_line ol
            WHERE (CAST(:since AS timestamptz) IS NULL OR ol.created_at >= CAST(:since AS timestamptz))
            GROUP BY ol.product_id_snapshot
            ORDER BY SUM(ol.quantity) DESC, ol.product_id_snapshot
            LIMIT :limit
            """, nativeQuery = true)
    List<UUID> bestSellingProductIds(@Param("since") Instant since, @Param("limit") int limit);

    /** The same ranking, narrowed to candidates the caller already has in hand. */
    @Query(value = """
            SELECT ol.product_id_snapshot
            FROM order_line ol
            WHERE ol.product_id_snapshot IN (:productIds)
              AND (CAST(:since AS timestamptz) IS NULL OR ol.created_at >= CAST(:since AS timestamptz))
            GROUP BY ol.product_id_snapshot
            ORDER BY SUM(ol.quantity) DESC, ol.product_id_snapshot
            LIMIT :limit
            """, nativeQuery = true)
    List<UUID> bestSellingAmong(
            @Param("productIds") Collection<UUID> productIds,
            @Param("since") Instant since,
            @Param("limit") int limit);

    /**
     * The same ranking one level up: which SELLERS shifted the most units.
     *
     * order_line.seller_id_snapshot, not a join to product - a line records who sold
     * it at the time, which is the honest answer even if the listing has since been
     * archived or the product moved. The tie-break is the seller id for the same
     * reason the product ranking's is: a "featured seller" that changes on every
     * refresh looks broken.
     */
    @Query(value = """
            SELECT ol.seller_id_snapshot
            FROM order_line ol
            WHERE (CAST(:since AS timestamptz) IS NULL OR ol.created_at >= CAST(:since AS timestamptz))
            GROUP BY ol.seller_id_snapshot
            ORDER BY SUM(ol.quantity) DESC, ol.seller_id_snapshot
            LIMIT :limit
            """, nativeQuery = true)
    List<UUID> bestSellingSellerIds(@Param("since") Instant since, @Param("limit") int limit);
}
