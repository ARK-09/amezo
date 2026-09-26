package com.arkindustries.amezo.catalog.dto;

import java.util.List;

/**
 * The contract's SellerProductRowPage: {content, page, totalElements,
 * totalPages} and nothing else.
 *
 * Written out rather than returning Spring Data's Page, whose JSON calls the
 * current index "number", nests a "pageable" object, and carries eight more
 * fields the client never reads. The unversioned routes already ship that
 * shape and keep it; a new route is the one chance to serve exactly what the
 * contract says without breaking anybody.
 */
public record SellerProductRowPageResponse(
        List<SellerProductRowResponse> content,
        int page,
        long totalElements,
        int totalPages
) {
}
