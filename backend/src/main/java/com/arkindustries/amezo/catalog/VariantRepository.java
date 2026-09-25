package com.arkindustries.amezo.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VariantRepository extends JpaRepository<Variant, UUID> {

    List<Variant> findByProductId(UUID productId);

    // Batched for the seller's product list - one query for every product's
    // variant count, not one query per row (same reasoning as
    // OfferRepository.findByVariantIdIn).
    List<Variant> findByProductIdIn(Collection<UUID> productIds);

    // The cart's batch lookup (GET /variants?ids=) - one query for the whole
    // drawer, not one per line.
    List<Variant> findByIdIn(Collection<UUID> ids);

    // SKU is unique across the whole catalog (V6's constraint), so an edit that
    // changes it has to be checked before it reaches the database - a constraint
    // violation surfacing as a 500 tells the seller nothing.
    Optional<Variant> findBySku(String sku);

    void deleteByProductId(UUID productId);
}
