package com.arkindustries.amezo.orders.dto;

import java.util.List;

/**
 * The contract's SellerOrderRowPage.
 *
 * The same four fields BuyerOrderSummaryPageResponse has, and for the same reason:
 * Spring's serialised Page calls its index `number`, so a client reading `page` off
 * it prints "Page NaN". The older unversioned /sellers/me/orders still returns
 * Spring's shape; this one does not.
 */
public record SellerOrderRowPageResponse(
        List<SellerOrderRowResponse> content,
        int page,
        long totalElements,
        int totalPages
) {
}
