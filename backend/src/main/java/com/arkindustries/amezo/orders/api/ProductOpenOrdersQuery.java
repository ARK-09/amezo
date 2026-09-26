package com.arkindustries.amezo.orders.api;

import java.util.List;
import java.util.UUID;

/**
 * "What is still owed on this product?" - the question the seller's product
 * drawer asks to fill its Open orders tile and its Active orders list.
 *
 * An api-package interface for the same reason OfferOrderHistoryQuery is one:
 * catalog may not import OrderLineRepository, Order or OrderStatus, and
 * PackageBoundaryTest fails the build if it does. This is the whole of what
 * catalog is allowed to know about order history.
 *
 * Open means PLACED or SHIPPED - placed and not yet delivered. DELIVERED lines
 * are finished business and are not the seller's outstanding commitment, which
 * is what the tile counts.
 *
 * Lines are matched on order_line.product_id_snapshot, the historical copy
 * taken at purchase time, so a product that has since been renamed or
 * recategorised still shows the orders placed against it.
 */
public interface ProductOpenOrdersQuery {

    /** Newest first - the order a seller works through a backlog in. */
    List<OpenOrderLine> findOpenLines(UUID productId);
}
