package com.arkindustries.amezo.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OfferRepository extends JpaRepository<Offer, UUID> {

    Optional<Offer> findByVariantId(UUID variantId);

    // Batched for product detail - one query for every variant's offer,
    // not one query per variant (that would be N+1 on a multi-variant product).
    List<Offer> findByVariantIdIn(Collection<UUID> variantIds);
}
