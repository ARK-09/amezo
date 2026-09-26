package com.arkindustries.amezo.orders.api;

import java.time.Instant;
import java.util.UUID;

/**
 * One still-open order line against one product, reduced to what the seller's
 * product drawer prints: which order it is, who bought it, how many, of which
 * variant, and whether it has shipped yet.
 *
 * Deliberately not the OrderLine entity, and deliberately not the Order: the
 * catalog feature has no business reading addresses, totals or payment state,
 * and PackageBoundaryTest would fail the build if it tried.
 *
 * variantId is the line's variant_id_snapshot - what was bought, not what the
 * catalog says today. The label for it is not here, because orders does not
 * store one; catalog resolves the label from its own Variant table, which is
 * the side that owns that fact.
 *
 * status is the ORDER's status, not the line's. A line has no status of its
 * own - shipping is per order - so "open" is a property of the order the line
 * sits on.
 */
public record OpenOrderLine(
        UUID orderId,
        UUID orderLineId,
        UUID variantId,
        String buyerEmail,
        int quantity,
        String status,
        Instant placedAt
) {
}
