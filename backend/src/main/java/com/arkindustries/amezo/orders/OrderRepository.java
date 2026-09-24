package com.arkindustries.amezo.orders;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    List<Order> findByBuyerIdentityId(UUID buyerIdentityId);

    // No findBySellerId(...): Order.sellerId is nullable and unset by
    // checkout (see Order's doc comment) - order_line.sellerIdSnapshot via
    // OrderLineRepository.findBySellerIdSnapshot is the only reliable way
    // to find a seller's orders. See SellerOrderService.
}
