package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;

/**
 * The window's headline figures (fixture.yaml: MetricTotals).
 *
 * views and conversionRate are nullable and are ALWAYS null today. Nothing in
 * this schema records a view, an impression or a visit - there is no table, no
 * column and no counter anywhere - so there is no number to return. They are
 * sent as null rather than as 0 or an estimate: a zero would read as "nobody
 * looked", which is a claim about the shop, and an estimate would be a figure
 * nobody measured. The dashboard's conversion tile renders the absence
 * explicitly. Giving them a value means recording views first.
 *
 * averageOrderValue is revenue over DISTINCT orders, not over lines - see
 * SellerMetricsRepository.WindowTotals.getOrderCount.
 */
public record MetricTotalsResponse(
        Integer views,
        long orders,
        BigDecimal revenue,
        BigDecimal conversionRate,
        BigDecimal averageOrderValue
) {
}
