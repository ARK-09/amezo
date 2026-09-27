package com.arkindustries.amezo.orders.api;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * "What is this order, and what could be sent back from it?" - the question the
 * refunds feature has to answer before it can accept, price or authorise a refund
 * request.
 *
 * An api-package interface for the same reason ProductOpenOrdersQuery and
 * OfferOrderHistoryQuery are: refunds may not import OrderRepository,
 * OrderLineRepository, Order, OrderLine or OrderStatus, and PackageBoundaryTest
 * fails the build if it does. This is the whole of what refunds is allowed to
 * know about an order.
 *
 * It answers nothing about refunds. The traffic in the other direction - an
 * order's derived REFUNDED status, its open-refund badge, its refundRequests
 * array - goes through refunds.api.OrderRefundQuery, so neither feature reaches
 * into the other and the two directions stay separately reviewable.
 */
public interface OrderRefundContextQuery {

    /** Empty when there is no such order. The caller decides whether that is a 404. */
    Optional<OrderRefundContext> findContext(UUID orderId);

    /**
     * Batched, keyed by order id, missing ids simply absent. For the buyer's own
     * refund list, which prints the order reference and placed date against every
     * row and would otherwise be one query per row.
     */
    Map<UUID, OrderRefundContext> findContexts(Collection<UUID> orderIds);
}
