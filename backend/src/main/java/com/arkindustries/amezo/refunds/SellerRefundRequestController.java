package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.refunds.dto.FacetListResponse;
import com.arkindustries.amezo.refunds.dto.RefundRequestPageResponse;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The seller's refund queue and its tab counts.
 *
 * No SecurityConfig change was needed for these two and none was made: the existing
 * "/api/v1/sellers/me/**" matcher already scopes this whole namespace to
 * hasRole("SELLER"), which is exactly why that matcher was written as a namespace
 * rather than as a list of methods. (The /api/v1/refund-requests routes are a
 * different story - see RefundRequestController.)
 *
 * Deciding on a request is not here. It is PATCH /api/v1/refund-requests/{id},
 * because a refund has two sides and one state machine, and a seller-only twin of
 * that endpoint would be a second place the transition guards had to be right.
 */
@RestController
@RequestMapping("/api/v1/sellers/me/refund-requests")
public class SellerRefundRequestController {

    /** The contract's default for the seller's queue, which is wider than the buyer's. */
    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;

    private final SellerRefundQueryService sellerRefundQueryService;

    SellerRefundRequestController(SellerRefundQueryService sellerRefundQueryService) {
        this.sellerRefundQueryService = sellerRefundQueryService;
    }

    @GetMapping
    public RefundRequestPageResponse list(
            @RequestParam(required = false) RefundStatus status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + DEFAULT_SIZE) int size) {
        return sellerRefundQueryService.list(
                status, q, PageRequest.of(Math.max(page, 0), clampSize(size)));
    }

    /**
     * The counts above the queue. Takes the search term and not the status, because a
     * strip that counted only the tab being viewed would report zero for every other
     * one - the contract says so in as many words ("Ignores status, as above").
     */
    @GetMapping("/facets")
    public FacetListResponse facets(@RequestParam(required = false) String q) {
        return sellerRefundQueryService.facets(q);
    }

    private static int clampSize(int size) {
        if (size < 1) {
            return DEFAULT_SIZE;
        }
        return Math.min(size, MAX_SIZE);
    }
}
