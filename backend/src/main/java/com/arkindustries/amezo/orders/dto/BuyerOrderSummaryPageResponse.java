package com.arkindustries.amezo.orders.dto;

import java.util.List;

/**
 * The contract's BuyerOrderSummaryPage: content, page, totalElements,
 * totalPages, and nothing else.
 *
 * NOT Spring's Page serialised straight to JSON, which is what the seller's order
 * list does. Spring's shape carries `number`, `size`, `pageable`, `sort`, `first`,
 * `last`, `numberOfElements` and an `empty` flag, none of which the contract
 * declares and none of which the generated client type has a field for - and its
 * page index is `number`, not `page`, so a client reading `page` off it gets
 * undefined and prints "Page NaN". Matching the contract is the point; the four
 * fields are cheap.
 */
public record BuyerOrderSummaryPageResponse(
        List<BuyerOrderSummaryResponse> content,
        int page,
        long totalElements,
        int totalPages
) {
}
