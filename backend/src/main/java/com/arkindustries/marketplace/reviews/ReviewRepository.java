package com.arkindustries.marketplace.reviews;

import com.arkindustries.marketplace.reviews.api.ReviewSummaryView;
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
    @Query("SELECT new com.arkindustries.marketplace.reviews.api.ReviewSummaryView(AVG(r.rating), COUNT(r)) "
            + "FROM Review r WHERE r.productId = :productId")
    ReviewSummaryView getSummary(@Param("productId") UUID productId);
}
