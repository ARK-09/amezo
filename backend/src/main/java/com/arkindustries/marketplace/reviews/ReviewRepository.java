package com.arkindustries.marketplace.reviews;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ReviewRepository extends JpaRepository<Review, UUID> {

    boolean existsByBuyerIdentityIdAndProductId(UUID buyerIdentityId, UUID productId);
}
