package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.identity.api.CurrentSeller;
import com.arkindustries.amezo.refunds.dto.FacetListResponse;
import com.arkindustries.amezo.refunds.dto.RefundRequestPageResponse;
import com.arkindustries.amezo.refunds.dto.RefundRequestSummaryResponse;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The seller's refund queue and the counts above it.
 *
 * Neither method takes a seller id. The routes live under
 * /api/v1/sellers/me/refund-requests, which SecurityConfig scopes to
 * hasRole("SELLER"), so the subject is whoever the session cookie names - and
 * cross-seller isolation is a property of the query rather than of a check
 * somebody could forget, the same reasoning SellerStoreService states.
 *
 * <h2>Why the search is applied in Java</h2>
 *
 * The contract says ?q= matches buyer name, buyer email, order reference and
 * product title. Exactly one of those four is in this feature's tables: the order
 * reference, and only because it is derived from an id. Buyer names live in
 * identity, product titles in catalog, and refunds may not join to either
 * (PackageBoundaryTest). So the SQL narrows to "this seller's requests, optionally
 * one status" - which is index-supported - and the term is applied to the assembled
 * search text.
 *
 * That is honest but it does mean the whole of one seller's request history is
 * loaded to serve a page of it. Acceptable because it is bounded by one seller's
 * own refunds, which is a small number for the lifetime of this schema, and because
 * the alternative is either a denormalised search column maintained across three
 * features or a join the architecture forbids. Flagged rather than left to be
 * discovered: if a seller ever has tens of thousands of refunds, this is the method
 * that needs a search-vector column on refund_request.
 */
@Service
public class SellerRefundQueryService {

    /** The bucket that means "no status filter". The literal the list endpoint takes. */
    private static final String ALL = "all";

    /**
     * The buckets, in the order the strip draws them, each keyed by what the list
     * endpoint accepts for it.
     *
     * <h2>Every non-terminal status has a bucket, deliberately</h2>
     *
     * APPROVED is here even though it is usually passed straight through - the
     * decision panel approves a replacement and marks it sent in one action. But if
     * that second call fails, the request sits at APPROVED, and without a bucket for
     * it the row would be invisible in every tab but "all" - a refund the seller
     * cannot find is worse than a tab nobody usually clicks.
     *
     * CANCELLED is the one omission: the buyer withdrew it, there is nothing for the
     * seller to do, and it is still counted in "all" so no total goes short.
     */
    private static final List<String> BUCKET_KEYS = List.of(
            RefundStatus.REQUESTED.name(),
            RefundStatus.APPROVED.name(),
            RefundStatus.AWAITING_RETURN.name(),
            RefundStatus.RETURN_RECEIVED.name(),
            RefundStatus.REFUNDED.name(),
            RefundStatus.REPLACEMENT_SENT.name(),
            RefundStatus.DECLINED.name(),
            ALL);

    private final RefundRequestRepository requests;
    private final RefundAssembler assembler;
    private final CurrentSeller currentSeller;

    SellerRefundQueryService(
            RefundRequestRepository requests, RefundAssembler assembler, CurrentSeller currentSeller) {
        this.requests = requests;
        this.assembler = assembler;
        this.currentSeller = currentSeller;
    }

    /** GET /api/v1/sellers/me/refund-requests. */
    @Transactional(readOnly = true)
    public RefundRequestPageResponse list(RefundStatus status, String q, Pageable pageable) {
        List<RefundRequest> matched = matching(status, q);

        int start = Math.min((int) pageable.getOffset(), matched.size());
        int end = Math.min(start + pageable.getPageSize(), matched.size());
        List<RefundRequestSummaryResponse> content =
                assembler.summaries(matched.subList(start, end));

        int totalPages = pageable.getPageSize() == 0
                ? 1
                : (int) Math.ceil((double) matched.size() / pageable.getPageSize());
        return new RefundRequestPageResponse(
                content,
                pageable.getPageNumber(),
                matched.size(),
                // A list with nothing in it is one empty page, not zero pages -
                // "Page 1 of 0" is what the frontend prints otherwise.
                Math.max(totalPages, 1));
    }

    /**
     * GET /api/v1/sellers/me/refund-requests/facets.
     *
     * Ignores the status, as the contract says: a strip that counted only the bucket
     * being viewed would report zero for every other tab, which is the one thing a
     * tab strip must not do. The search term IS applied, so narrowing the list
     * narrows the counts with it.
     *
     * Every bucket carries money as well as a count, because the design prints both
     * ("3 · $327 at stake"). The amount is each request's effective one - what was
     * approved if anything was, else what was asked - so the Refunded bucket totals
     * what was actually released rather than what was originally claimed.
     */
    @Transactional(readOnly = true)
    public FacetListResponse facets(String q) {
        List<RefundRequest> all = matching(null, q);

        Map<String, Long> counts = new LinkedHashMap<>();
        Map<String, BigDecimal> values = new LinkedHashMap<>();
        for (String key : BUCKET_KEYS) {
            counts.put(key, 0L);
            values.put(key, BigDecimal.ZERO);
        }

        for (RefundRequest request : all) {
            String key = request.getStatus().name();
            BigDecimal amount = request.effectiveAmount();
            if (counts.containsKey(key)) {
                counts.merge(key, 1L, Long::sum);
                values.merge(key, amount, BigDecimal::add);
            }
            // Every request counts towards "all", including the statuses with no tab
            // of their own.
            counts.merge(ALL, 1L, Long::sum);
            values.merge(ALL, amount, BigDecimal::add);
        }

        List<FacetListResponse.Facet> facets = new ArrayList<>();
        for (String key : BUCKET_KEYS) {
            facets.add(new FacetListResponse.Facet(
                    key, counts.get(key), values.get(key), RefundRequestService.CURRENCY));
        }
        return new FacetListResponse(facets);
    }

    /** This seller's requests, narrowed by status in SQL and by the term in Java. */
    private List<RefundRequest> matching(RefundStatus status, String q) {
        UUID sellerId = currentSeller.sellerId();
        List<RefundRequest> forSeller = requests.findForSeller(sellerId, status);
        if (q == null || q.isBlank()) {
            return forSeller;
        }
        String term = q.trim().toLowerCase();
        Map<UUID, String> searchable = assembler.searchTextByRequestId(forSeller);
        return forSeller.stream()
                .filter(request -> searchable.getOrDefault(request.getId(), "").contains(term))
                .toList();
    }
}
