package com.arkindustries.amezo.catalog.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * What is still owed on one product: the number behind the drawer's "Open
 * orders" tile, the "N units reserved" line above the list, and the list
 * itself.
 *
 * openOrderCount counts distinct ORDERS, not lines - two lines of the same
 * product on one order are one order to chase. reservedUnits sums the
 * quantities across every open line, which is the stock figure the seller has
 * already promised away.
 *
 * variantLabel is resolved here, in catalog, from the line's
 * variant_id_snapshot. Orders stores the id, not the label, and catalog owns
 * variant labels - so orders hands over the id and this side names it. A
 * variant deleted since the purchase has no label left to find; the field is
 * null then rather than invented, and the client prints the quantity alone.
 */
public record ProductOpenOrdersResponse(
        int openOrderCount,
        int reservedUnits,
        List<OpenOrderResponse> orders
) {
    public record OpenOrderResponse(
            UUID orderId,
            UUID orderLineId,
            String buyerEmail,
            UUID variantId,
            String variantLabel,
            int quantity,
            String status,
            Instant placedAt
    ) {
    }
}
