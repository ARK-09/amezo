package com.arkindustries.amezo.refunds.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * The contract's RefundRequestLine. Titles and variant labels are resolved from
 * the catalogue at read time through catalog.api.ProductVariantSummaryQuery - the
 * same way the seller's order detail resolves its own line labels, and with the
 * same fallback for a product that has since been removed.
 */
public record RefundRequestLineResponse(
        UUID orderLineId,
        String productTitle,
        String variantLabel,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal
) {
}
