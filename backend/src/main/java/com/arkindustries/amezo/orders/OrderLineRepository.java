package com.arkindustries.amezo.orders;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface OrderLineRepository extends JpaRepository<OrderLine, UUID> {

    List<OrderLine> findByOrderId(UUID orderId);

    List<OrderLine> findBySellerIdSnapshot(UUID sellerId);

    // Batched for the seller's order list total - one query for every
    // order's lines, not one query per order (same reasoning used
    // throughout catalog's repositories).
    List<OrderLine> findByOrderIdIn(Collection<UUID> orderIds);

    // Backs OfferOrderHistoryQuery: catalog asks before deleting an offer,
    // because order_line.offer_id is a foreign key and a sold offer can't go.
    boolean existsByOfferIdIn(Collection<UUID> offerIds);

    /**
     * Backs OrderLinePurchaseQuery.findPurchase - "has this buyer bought this
     * product?", which is what gates writing a review.
     *
     * JPQL with a join to orders rather than a derived name: the buyer lives on the
     * order, and order_line has no association mapped to it (both sides are plain
     * id columns by design), so there is no property path for Spring Data to
     * derive. Ordered by the line's own created_at so a repeat buyer always gets
     * their first purchase back and the answer is stable between calls.
     */
    @Query("SELECT ol FROM OrderLine ol, Order o "
            + "WHERE o.id = ol.orderId "
            + "AND ol.productIdSnapshot = :productId "
            + "AND o.buyerIdentityId = :buyerIdentityId "
            + "ORDER BY ol.createdAt ASC, ol.id ASC")
    List<OrderLine> findPurchases(
            @Param("productId") UUID productId, @Param("buyerIdentityId") UUID buyerIdentityId);
}
