package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;

/**
 * One slice of GET /api/v1/sellers/me/metrics/category-breakdown (fixture.yaml:
 * CategoryShare).
 *
 * share is against the whole window's revenue, the same denominator
 * TopProductResponse.share uses. Shares therefore sum to 1 only when every
 * product sold in the window is still in the catalog with a category; a product
 * the catalog no longer knows is left out rather than filed under an invented
 * "Other", and the donut then honestly does not close.
 */
public record CategoryShareResponse(
        MetricCategoryResponse category,
        BigDecimal revenue,
        long units,
        BigDecimal share
) {
}
