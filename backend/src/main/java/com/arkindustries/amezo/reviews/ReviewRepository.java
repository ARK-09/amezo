package com.arkindustries.amezo.reviews;

import com.arkindustries.amezo.reviews.api.ReviewSummaryView;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface ReviewRepository extends JpaRepository<Review, UUID> {

    boolean existsByBuyerIdentityIdAndProductId(UUID buyerIdentityId, UUID productId);

    /**
     * AVG()/COUNT() with no GROUP BY always returns exactly one row, even
     * over zero matching reviews (averageRating null, count 0) - this is
     * standard SQL aggregate behavior, not a special case handled here.
     */
    @Query("SELECT new com.arkindustries.amezo.reviews.api.ReviewSummaryView(AVG(r.rating), COUNT(r)) "
            + "FROM Review r WHERE r.productId = :productId")
    ReviewSummaryView getSummary(@Param("productId") UUID productId);

    /**
     * Native, not JPQL: fetches the variant label bought via one join
     * (review -> order_line -> variant) instead of N+1 lookups per review.
     * order_line.variant_id_snapshot is not a DB-enforced FK (it's a
     * purchase-time snapshot, deliberately decoupled from live catalog
     * state - see the orders migrations), but the join is valid at the SQL
     * level since variants are never deleted in this MVP.
     */
    @Query(
        value = "SELECT r.id AS id, r.rating AS rating, r.body AS body, r.created_at AS createdAt, "
                + "v.label AS variantLabel "
                + "FROM review r "
                + "JOIN order_line ol ON ol.id = r.order_line_id "
                + "JOIN variant v ON v.id = ol.variant_id_snapshot "
                + "WHERE r.product_id = :productId "
                + "ORDER BY r.created_at DESC",
        countQuery = "SELECT count(*) FROM review r WHERE r.product_id = :productId",
        nativeQuery = true
    )
    Page<ReviewWithVariantLabelProjection> findByProductId(@Param("productId") UUID productId, Pageable pageable);
}
