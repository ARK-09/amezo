package com.arkindustries.amezo.catalog;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OfferRepository extends JpaRepository<Offer, UUID> {

    Optional<Offer> findByVariantId(UUID variantId);

    // Batched for product detail - one query for every variant's offer,
    // not one query per variant (that would be N+1 on a multi-variant product).
    List<Offer> findByVariantIdIn(Collection<UUID> variantIds);

    void deleteByVariantIdIn(Collection<UUID> variantIds);

    /**
     * The race-proof stock check: WHERE stock_qty >= :quantity means this
     * only matches (and only decrements) when there's enough stock. The
     * returned row count IS the check - a pre-read-then-write would have a
     * TOCTOU gap under concurrent checkouts, this doesn't.
     */
    @Modifying
    @Query("UPDATE Offer o SET o.stockQty = o.stockQty - :quantity "
            + "WHERE o.id = :offerId AND o.stockQty >= :quantity")
    int decrementStock(@Param("offerId") UUID offerId, @Param("quantity") int quantity);
}
