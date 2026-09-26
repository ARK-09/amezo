package com.arkindustries.amezo.orders;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    List<Order> findByBuyerIdentityId(UUID buyerIdentityId);

    /**
     * The buyer's most recent order, for prefilling checkout. Ordered by placedAt
     * rather than by id: the id is a random UUID, so "the latest row" is not a
     * thing the primary key can tell you.
     */
    Optional<Order> findFirstByBuyerIdentityIdOrderByPlacedAtDesc(UUID buyerIdentityId);

    // No findBySellerId(...): Order.sellerId is nullable and unset by
    // checkout (see Order's doc comment) - order_line.sellerIdSnapshot via
    // OrderLineRepository.findBySellerIdSnapshot is the only reliable way
    // to find a seller's orders. See SellerOrderService.
}
