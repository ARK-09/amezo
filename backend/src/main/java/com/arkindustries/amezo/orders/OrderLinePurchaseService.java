package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.api.OrderLinePurchaseQuery;
import com.arkindustries.amezo.orders.api.PurchasedLine;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

// Package-private: reviews depends on the OrderLinePurchaseQuery interface, never
// on this class or on OrderLineRepository.
@Service
class OrderLinePurchaseService implements OrderLinePurchaseQuery {

    private final OrderLineRepository orderLineRepository;
    private final OrderRepository orderRepository;

    OrderLinePurchaseService(OrderLineRepository orderLineRepository, OrderRepository orderRepository) {
        this.orderLineRepository = orderLineRepository;
        this.orderRepository = orderRepository;
    }

    /**
     * The buyer comes from the line's ORDER, not from the line: order_line has no
     * buyer column, because a line belongs to exactly one order and duplicating
     * the buyer onto it would be a second place for the same fact to be wrong.
     */
    @Override
    @Transactional(readOnly = true)
    public Optional<PurchasedLine> findLine(UUID orderLineId) {
        return orderLineRepository.findById(orderLineId)
                .flatMap(line -> orderRepository.findById(line.getOrderId())
                        .map(order -> new PurchasedLine(
                                line.getId(),
                                order.getBuyerIdentityId(),
                                line.getProductIdSnapshot(),
                                line.getVariantIdSnapshot())));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PurchasedLine> findPurchase(UUID buyerIdentityId, UUID productId) {
        return orderLineRepository.findPurchases(productId, buyerIdentityId).stream()
                .findFirst()
                .map(line -> new PurchasedLine(
                        line.getId(),
                        buyerIdentityId,
                        line.getProductIdSnapshot(),
                        line.getVariantIdSnapshot()));
    }
}
