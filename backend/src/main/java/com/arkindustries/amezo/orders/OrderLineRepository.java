package com.arkindustries.amezo.orders;

import org.springframework.data.jpa.repository.JpaRepository;

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
}
