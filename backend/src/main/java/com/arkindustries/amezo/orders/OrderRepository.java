package com.arkindustries.amezo.orders;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    List<Order> findByBuyerIdentityId(UUID buyerIdentityId);

    Page<Order> findBySellerId(UUID sellerId, Pageable pageable);

    Page<Order> findBySellerIdAndStatus(UUID sellerId, OrderStatus status, Pageable pageable);
}
