package com.arkindustries.amezo.reviews;

import com.arkindustries.amezo.reviews.api.ProductReviewSummaryView;
import com.arkindustries.amezo.reviews.api.ReviewSummaryView;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReviewRepository extends JpaRepository<Review, UUID> {

    boolean existsByBuyerIdentityIdAndProductId(UUID buyerIdentityId, UUID productId);

    Optional<Review> findByBuyerIdentityIdAndProductId(UUID buyerIdentityId, UUID productId);

    /**
     * AVG()/COUNT() with no GROUP BY always returns exactly one row, even
     * over zero matching reviews (averageRating null, count 0) - this is
     * standard SQL aggregate behavior, not a special case handled here.
     */
    @Query("SELECT new com.arkindustries.amezo.reviews.api.ReviewSummaryView(AVG(r.rating), COUNT(r)) "
            + "FROM Review r WHERE r.productId = :productId")
    ReviewSummaryView getSummary(@Param("productId") UUID productId);

    /** The batch form: one grouped aggregate for a whole page of products. */
    @Query("SELECT new com.arkindustries.amezo.reviews.api.ProductReviewSummaryView("
            + "r.productId, AVG(r.rating), COUNT(r)) "
            + "FROM Review r WHERE r.productId IN :productIds GROUP BY r.productId")
    List<ProductReviewSummaryView> getSummaries(@Param("productIds") Collection<UUID> productIds);

    /**
     * Native, not JPQL: fetches the variant label bought via one join
     * (review -> order_line -> variant) instead of N+1 lookups per review.
     * order_line.variant_id_snapshot is not a DB-enforced FK (it's a
     * purchase-time snapshot, deliberately decoupled from live catalog
     * state - see the orders migrations), but the join is valid at the SQL
     * level since variants are never deleted in this MVP.
     *
     * buyer_identity is joined for the reviewer's name, on the same reasoning that
     * already justifies the order_line and variant joins here: the alternative is
     * a second round trip per page of reviews through identity's api package, for
     * a column this query is already positioned to read. The frontend has rendered
     * a reviewer name since it was built - the response simply never carried one.
     */
    @Query(
        value = "SELECT r.id AS id, r.rating AS rating, r.body AS body, r.created_at AS createdAt, "
                + "v.label AS variantLabel, bi.full_name AS reviewerName "
                + "FROM review r "
                + "JOIN order_line ol ON ol.id = r.order_line_id "
                + "JOIN variant v ON v.id = ol.variant_id_snapshot "
                + "JOIN buyer_identity bi ON bi.id = r.buyer_identity_id "
                + "WHERE r.product_id = :productId "
                + "ORDER BY r.created_at DESC",
        countQuery = "SELECT count(*) FROM review r WHERE r.product_id = :productId",
        nativeQuery = true
    )
    Page<ReviewWithVariantLabelProjection> findByProductId(@Param("productId") UUID productId, Pageable pageable);
}
