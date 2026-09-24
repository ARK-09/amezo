package com.arkindustries.marketplace.orders;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface OrderLineRepository extends JpaRepository<OrderLine, UUID> {

    List<OrderLine> findByOrderId(UUID orderId);

    List<OrderLine> findBySellerIdSnapshot(UUID sellerId);
}
