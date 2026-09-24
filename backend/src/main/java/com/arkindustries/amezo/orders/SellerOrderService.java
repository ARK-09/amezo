package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.identity.api.CurrentSeller;
import com.arkindustries.amezo.orders.dto.OrderLineResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderDetailResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class SellerOrderService {

    private final OrderRepository orderRepository;
    private final OrderLineRepository orderLineRepository;
    private final CurrentSeller currentSeller;
    private final ProductVariantSummaryQuery productVariantSummaryQuery;

    public SellerOrderService(
            OrderRepository orderRepository,
            OrderLineRepository orderLineRepository,
            CurrentSeller currentSeller,
            ProductVariantSummaryQuery productVariantSummaryQuery) {
        this.orderRepository = orderRepository;
        this.orderLineRepository = orderLineRepository;
        this.currentSeller = currentSeller;
        this.productVariantSummaryQuery = productVariantSummaryQuery;
    }

    public Page<SellerOrderSummaryResponse> listMine(OrderStatus statusFilter, Pageable pageable) {
        UUID sellerId = currentSeller.sellerId();
        Page<Order> orders = statusFilter == null
                ? orderRepository.findBySellerId(sellerId, pageable)
                : orderRepository.findBySellerIdAndStatus(sellerId, statusFilter, pageable);

        List<UUID> orderIds = orders.map(Order::getId).toList();
        Map<UUID, BigDecimal> totalsByOrderId = totalsByOrderId(orderIds);

        return orders.map(order -> new SellerOrderSummaryResponse(
                order.getId(),
                order.getBuyerEmailSnapshot(),
                order.getPlacedAt(),
                totalsByOrderId.getOrDefault(order.getId(), BigDecimal.ZERO),
                order.getStatus()));
    }

    public SellerOrderDetailResponse getDetail(UUID orderId) {
        Order order = ownedOrder(orderId);
        List<OrderLine> lines = orderLineRepository.findByOrderId(order.getId());

        Map<UUID, String> productTitles = productVariantSummaryQuery.productTitlesByIds(
                lines.stream().map(OrderLine::getProductIdSnapshot).toList());
        Map<UUID, String> variantLabels = productVariantSummaryQuery.variantLabelsByIds(
                lines.stream().map(OrderLine::getVariantIdSnapshot).toList());

        List<OrderLineResponse> lineResponses = lines.stream()
                .map(line -> new OrderLineResponse(
                        line.getId(),
                        productTitles.getOrDefault(line.getProductIdSnapshot(), "(product removed)"),
                        variantLabels.getOrDefault(line.getVariantIdSnapshot(), "(variant removed)"),
                        line.getQuantity(),
                        line.getUnitPriceSnapshot()))
                .toList();

        BigDecimal total = total(lines);

        return new SellerOrderDetailResponse(
                order.getId(),
                order.getBuyerEmailSnapshot(),
                order.getPlacedAt(),
                total,
                order.getStatus(),
                order.getTrackingNumber(),
                order.getShippedAt(),
                lineResponses);
    }

    public SellerOrderDetailResponse ship(UUID orderId, String trackingNumber) {
        Order order = ownedOrder(orderId);
        if (order.getStatus() != OrderStatus.PLACED) {
            throw new ConflictException(
                    URI.create("https://api/errors/already-shipped"),
                    "Already shipped",
                    "Order " + orderId + " is already " + order.getStatus(),
                    List.of());
        }
        order.setStatus(OrderStatus.SHIPPED);
        order.setTrackingNumber(trackingNumber);
        order.setShippedAt(Instant.now());
        orderRepository.save(order);

        return getDetail(orderId);
    }

    private Order ownedOrder(UUID orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("Order " + orderId + " not found"));
        if (!order.getSellerId().equals(currentSeller.sellerId())) {
            throw new NotFoundException("Order " + orderId + " not found");
        }
        return order;
    }

    private Map<UUID, BigDecimal> totalsByOrderId(List<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        return orderLineRepository.findByOrderIdIn(orderIds).stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        OrderLine::getOrderId,
                        java.util.stream.Collectors.reducing(
                                BigDecimal.ZERO,
                                line -> line.getUnitPriceSnapshot().multiply(BigDecimal.valueOf(line.getQuantity())),
                                BigDecimal::add)));
    }

    private BigDecimal total(List<OrderLine> lines) {
        return lines.stream()
                .map(line -> line.getUnitPriceSnapshot().multiply(BigDecimal.valueOf(line.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
