package com.arkindustries.amezo.catalog.dto;

import java.util.List;

/**
 * The contract's ProductSummaryPage: content, page, totalElements, totalPages.
 *
 * Not Spring's serialised Page, which is what the older GET /products returns. That
 * shape carries `number`, `size`, `pageable`, `sort`, `first`, `last`,
 * `numberOfElements` and an `empty` flag, none of which the contract declares - and
 * its page index is `number`, so a client reading `page` off it gets undefined and
 * prints "Page NaN". Same reasoning, and same four fields, as
 * orders.dto.BuyerOrderSummaryPageResponse.
 */
public record ProductSummaryPageResponse(
        List<ProductSummaryResponse> content,
        int page,
        long totalElements,
        int totalPages) {
}
