package com.arkindustries.amezo.orders.dto;

import java.util.List;

/**
 * GET /api/v1/sellers/me/metrics (fixture.yaml: SellerMetrics).
 *
 * previousTotals is NULLABLE and is null when the immediately preceding window
 * holds no line of this seller's at all - nothing was measured there, so nothing
 * is claimed about it. It is never coalesced to zero: a measured zero ("the shop
 * was open and sold nothing") and an unmeasured window are different facts, and
 * the dashboard prints them differently - "New" against "No prior data", see
 * changeVsPrevious.ts. order_line is the only evidence this endpoint has, and it
 * cannot tell a quiet month from a month before the seller existed, so the
 * honest answer to "no rows" is "not measured".
 *
 * currency is a documented constant, "USD". No price in this schema carries a
 * currency - product offers, order lines and order totals are all bare
 * NUMERIC(10,2) - and the frontend's formatPrice() is likewise fixed to USD.
 * The field exists so the contract has somewhere to put the answer on the day
 * money becomes multi-currency; it is not read from anything today.
 */
public record SellerMetricsResponse(
        String from,
        String to,
        String currency,
        MetricTotalsResponse totals,
        MetricTotalsResponse previousTotals,
        List<MetricPointResponse> series
) {
}
