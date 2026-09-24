package com.arkindustries.amezo.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface VariantRepository extends JpaRepository<Variant, UUID> {

    List<Variant> findByProductId(UUID productId);

    // Batched for the seller's product list - one query for every product's
    // variant count, not one query per row (same reasoning as
    // OfferRepository.findByVariantIdIn).
    List<Variant> findByProductIdIn(Collection<UUID> productIds);

    void deleteByProductId(UUID productId);
}
