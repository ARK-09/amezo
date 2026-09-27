package com.arkindustries.amezo.orders.dto;

import java.time.Instant;

/**
 * The contract's OrderTimelineEntry - one stage of the delivery progress bar the
 * expanded order card draws.
 *
 * `code` is a String and not OrderStatus even though every value it can take
 * today is also an OrderStatus name. The contract's timeline codes and its order
 * statuses are two different vocabularies that currently overlap: a timeline has
 * stages an order is never "in" (the carrier states), and an order has statuses
 * that are not stages at all (CANCELLED, REFUNDED). Typing this as OrderStatus
 * would weld them together and make the first divergence a compile error in the
 * wrong file.
 *
 * `estimated` is false in every entry this backend produces. It means "`at` is a
 * projection rather than something that happened", and nothing here projects: see
 * BuyerOrderService.timelineFor for which stages have a real timestamp and which
 * have no column to read one from.
 */
public record OrderTimelineEntryResponse(
        String code,
        String label,
        Instant at,
        boolean estimated,
        boolean completed,
        String detail
) {
}
