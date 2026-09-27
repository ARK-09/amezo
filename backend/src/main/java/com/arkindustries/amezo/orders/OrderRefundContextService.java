package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.api.OrderRefundContext;
import com.arkindustries.amezo.orders.api.OrderRefundContextQuery;
import com.arkindustries.amezo.orders.api.OrderRefundLine;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Orders' side of the refund conversation: it hands over one order's buyer,
 * date, total and lines, and nothing else.
 *
 * A service of its own rather than another method on SellerOrderService, which is
 * seller-scoped by construction - every read in it is filtered to the caller's own
 * lines. A refund is raised by the BUYER against the WHOLE order, so it needs the
 * unfiltered row, and adding an unscoped read to a class whose every other method
 * is scoped is how an ownership check gets skipped by accident later.
 *
 * It performs no authorization itself. It returns whose order it is
 * (buyerIdentityId) and whose line each line is (sellerId), and refunds compares
 * them against the caller - which keeps the ownership rule in the feature that
 * owns the resource, rather than split across two features that would each have
 * to be right.
 */
@Service
class OrderRefundContextService implements OrderRefundContextQuery {

    private final OrderRepository orderRepository;
    private final OrderLineRepository orderLineRepository;

    OrderRefundContextService(OrderRepository orderRepository, OrderLineRepository orderLineRepository) {
        this.orderRepository = orderRepository;
        this.orderLineRepository = orderLineRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OrderRefundContext> findContext(UUID orderId) {
        return orderRepository.findById(orderId)
                .map(order -> toContext(order, orderLineRepository.findByOrderId(orderId)));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, OrderRefundContext> findContexts(Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        // Two queries for any number of orders, not two per order.
        Map<UUID, List<OrderLine>> linesByOrder = orderLineRepository.findByOrderIdIn(orderIds).stream()
                .collect(Collectors.groupingBy(OrderLine::getOrderId));

        return orderRepository.findAllById(orderIds).stream()
                .collect(Collectors.toMap(
                        Order::getId,
                        order -> toContext(order, linesByOrder.getOrDefault(order.getId(), List.of()))));
    }

    private OrderRefundContext toContext(Order order, List<OrderLine> lines) {
        List<OrderRefundLine> refundLines = lines.stream()
                // Stable ordering, so the lines on a refund form and on the
                // request it creates are in the same order every time.
                .sorted(Comparator.comparing(OrderLine::getCreatedAt).thenComparing(OrderLine::getId))
                .map(line -> new OrderRefundLine(
                        line.getId(),
                        line.getSellerIdSnapshot(),
                        line.getProductIdSnapshot(),
                        line.getVariantIdSnapshot(),
                        line.getQuantity(),
                        line.getUnitPriceSnapshot(),
                        lineTotal(line)))
                .toList();

        BigDecimal total = refundLines.stream()
                .map(OrderRefundLine::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new OrderRefundContext(
                order.getId(),
                order.getBuyerIdentityId(),
                order.getBuyerEmailSnapshot(),
                order.getPlacedAt(),
                total,
                refundLines);
    }

    private static BigDecimal lineTotal(OrderLine line) {
        return line.getUnitPriceSnapshot().multiply(BigDecimal.valueOf(line.getQuantity()));
    }
}
