package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.identity.api.CurrentSeller;
import com.arkindustries.amezo.orders.dto.OrderLineResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderDetailResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Ownership here is per LINE, not per order: Order.sellerId is nullable and
 * no longer set by checkout (see Order's own doc comment) - one order can
 * now hold lines from multiple sellers, and order_line.sellerIdSnapshot is
 * the only reliable owner per item. A seller's "my orders" list and order
 * detail are therefore always scoped to that seller's own lines within an
 * order, never the whole order or another seller's lines/total.
 *
 * Known gap, not fixed here (a real schema change, out of scope for this
 * pass): Order.status/trackingNumber/shippedAt are still ORDER-level
 * fields. If an order spans two sellers, one of them calling ship() marks
 * the whole order - and implicitly the other seller's lines in it - as
 * shipped. Flagged rather than silently left for someone to discover via a
 * support ticket.
 */
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
        List<OrderLine> myLines = orderLineRepository.findBySellerIdSnapshot(sellerId);

        Map<UUID, BigDecimal> myTotalsByOrderId = myLines.stream()
                .collect(Collectors.groupingBy(
                        OrderLine::getOrderId,
                        Collectors.reducing(
                                BigDecimal.ZERO,
                                line -> line.getUnitPriceSnapshot().multiply(BigDecimal.valueOf(line.getQuantity())),
                                BigDecimal::add)));

        List<Order> myOrders = orderRepository.findAllById(myTotalsByOrderId.keySet()).stream()
                .filter(order -> statusFilter == null || order.getStatus() == statusFilter)
                .sorted(Comparator.comparing(Order::getPlacedAt).reversed())
                .toList();

        int start = Math.min((int) pageable.getOffset(), myOrders.size());
        int end = Math.min(start + pageable.getPageSize(), myOrders.size());

        List<SellerOrderSummaryResponse> content = myOrders.subList(start, end).stream()
                .map(order -> new SellerOrderSummaryResponse(
                        order.getId(),
                        order.getBuyerEmailSnapshot(),
                        order.getPlacedAt(),
                        myTotalsByOrderId.getOrDefault(order.getId(), BigDecimal.ZERO),
                        order.getStatus()))
                .toList();

        return new PageImpl<>(content, pageable, myOrders.size());
    }

    public SellerOrderDetailResponse getDetail(UUID orderId) {
        UUID sellerId = currentSeller.sellerId();
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("Order " + orderId + " not found"));

        List<OrderLine> myLines = orderLineRepository.findByOrderId(order.getId()).stream()
                .filter(line -> line.getSellerIdSnapshot().equals(sellerId))
                .toList();
        if (myLines.isEmpty()) {
            // Either the order doesn't exist, or none of its lines are this
            // seller's - both look identical from the outside (404, not 403,
            // per the products/images ownership convention elsewhere).
            throw new NotFoundException("Order " + orderId + " not found");
        }

        Map<UUID, String> productTitles = productVariantSummaryQuery.productTitlesByIds(
                myLines.stream().map(OrderLine::getProductIdSnapshot).toList());
        Map<UUID, String> variantLabels = productVariantSummaryQuery.variantLabelsByIds(
                myLines.stream().map(OrderLine::getVariantIdSnapshot).toList());

        List<OrderLineResponse> lineResponses = myLines.stream()
                .map(line -> {
                    BigDecimal lineTotal = line.getUnitPriceSnapshot().multiply(BigDecimal.valueOf(line.getQuantity()));
                    return new OrderLineResponse(
                            line.getId(),
                            productTitles.getOrDefault(line.getProductIdSnapshot(), "(product removed)"),
                            variantLabels.getOrDefault(line.getVariantIdSnapshot(), "(variant removed)"),
                            line.getQuantity(),
                            line.getUnitPriceSnapshot(),
                            lineTotal);
                })
                .toList();

        BigDecimal myTotal = lineResponses.stream()
                .map(OrderLineResponse::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new SellerOrderDetailResponse(
                order.getId(),
                order.getBuyerEmailSnapshot(),
                order.getPlacedAt(),
                myTotal,
                order.getStatus(),
                order.getTrackingNumber(),
                order.getShippedAt(),
                lineResponses);
    }

    public SellerOrderDetailResponse ship(UUID orderId, String trackingNumber) {
        // getDetail() both validates ownership (throws 404 if this seller has
        // no lines on the order) and gives us the up-to-date status to check.
        SellerOrderDetailResponse current = getDetail(orderId);
        if (current.status() != OrderStatus.PLACED) {
            throw new ConflictException(
                    URI.create("https://api/errors/already-shipped"),
                    "Already shipped",
                    "Order " + orderId + " is already " + current.status(),
                    List.of());
        }

        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("Order " + orderId + " not found"));
        order.setStatus(OrderStatus.SHIPPED);
        order.setTrackingNumber(trackingNumber);
        order.setShippedAt(Instant.now());
        orderRepository.save(order);

        return getDetail(orderId);
    }
}
