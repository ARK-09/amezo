package com.arkindustries.amezo.refunds.dto;

import java.util.List;

/**
 * The contract's RefundRequestPage: {content, page, totalElements, totalPages}
 * and nothing else.
 *
 * Written out rather than returning Spring Data's Page, for the same reason
 * catalog's SellerProductRowPageResponse is: Page's JSON calls the current index
 * "number", nests a "pageable" object and carries eight more fields no client
 * reads. Every route here is new, so there is nothing to break by serving exactly
 * what the contract says.
 */
public record RefundRequestPageResponse(
        List<RefundRequestSummaryResponse> content,
        int page,
        long totalElements,
        int totalPages
) {
}
