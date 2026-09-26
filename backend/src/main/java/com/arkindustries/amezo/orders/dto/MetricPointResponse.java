package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;

/**
 * One bucket of the dashboard series (fixture.yaml: MetricPoint).
 *
 * date is the bucket's FIRST day as YYYY-MM-DD, in UTC. For interval=day that
 * is the day itself; for week and month it is the Monday / the first of the
 * month the bucket covers.
 *
 * views is nullable and always null - see MetricTotalsResponse for why.
 */
public record MetricPointResponse(
        String date,
        Integer views,
        long orders,
        BigDecimal revenue
) {
}
