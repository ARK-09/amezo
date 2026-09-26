package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One row of GET /api/v1/sellers/me/metrics/top-products (fixture.yaml:
 * TopProduct).
 *
 * productRef is the product's slug, which is what product links are built from
 * - the same reference GET /products/{productRef} takes.
 *
 * share is this product's revenue over the WHOLE window's revenue, not over the
 * rows returned. A top-5 list whose shares summed to 100% would be telling the
 * seller these five are their entire shop.
 *
 * previousRevenue is null when the product has no line at all in the previous
 * window. See SellerMetricsRepository.RankedProduct.getPreviousRevenue - it is
 * never coalesced to zero.
 */
public record TopProductResponse(
        UUID productId,
        String productRef,
        String title,
        String thumbnailUrl,
        long units,
        BigDecimal revenue,
        BigDecimal share,
        BigDecimal previousRevenue
) {
}
