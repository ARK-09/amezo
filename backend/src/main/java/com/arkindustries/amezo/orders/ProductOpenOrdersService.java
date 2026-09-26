package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.api.OpenOrderLine;
import com.arkindustries.amezo.orders.api.ProductOpenOrdersQuery;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;

// Package-private: catalog depends on the ProductOpenOrdersQuery interface,
// never on this class, on OrderLineRepository, or on OrderStatus.
@Service
class ProductOpenOrdersService implements ProductOpenOrdersQuery {

    /**
     * What "open" means, in one place. PLACED and SHIPPED are the two states
     * where the seller still owes the buyer something; DELIVERED is finished and
     * is not part of the outstanding count the drawer shows.
     */
    private static final Set<OrderStatus> OPEN_STATUSES = Set.of(OrderStatus.PLACED, OrderStatus.SHIPPED);

    private final OrderLineRepository orderLineRepository;

    ProductOpenOrdersService(OrderLineRepository orderLineRepository) {
        this.orderLineRepository = orderLineRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<OpenOrderLine> findOpenLines(UUID productId) {
        return orderLineRepository.findLinesForProductByOrderStatus(productId, OPEN_STATUSES).stream()
                .map(row -> {
                    OrderLine line = (OrderLine) row[0];
                    Order order = (Order) row[1];
                    return new OpenOrderLine(
                            order.getId(),
                            line.getId(),
                            line.getVariantIdSnapshot(),
                            order.getBuyerEmailSnapshot(),
                            line.getQuantity(),
                            order.getStatus().name(),
                            order.getPlacedAt());
                })
                .toList();
    }
}
