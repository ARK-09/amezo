package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.refunds.dto.CreateRefundRequestRequest;
import com.arkindustries.amezo.refunds.dto.RefundRequestDetailResponse;
import com.arkindustries.amezo.refunds.dto.RefundRequestPageResponse;
import com.arkindustries.amezo.refunds.dto.UpdateRefundRequestRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * The refund resource: the buyer's list, the create, the shared read and the PATCH
 * that is the entire state machine.
 *
 * <h2>The routes and who reaches them</h2>
 *
 * This is NOT under /api/v1/sellers/me/**, so the existing matcher does not cover
 * it and SecurityConfig needed new rules - see the ones added there, and the report
 * that says so loudly. The split is deliberate:
 *
 * <ul>
 *   <li>GET and POST on the collection are the BUYER's - their own list, and raising
 *       a request against their own order;
 *   <li>GET and PATCH on one request are BOTH roles', because a refund has two
 *       sides. The service decides which side the caller is on and what that side
 *       may do; the route only insists on being signed in as one of them.
 * </ul>
 *
 * Authorization proper is the service's: NotFoundException for someone else's id,
 * per this repo's convention, rather than a 403 that would confirm the record
 * exists.
 *
 * <h2>Why PATCH and not /approve, /decline, /release</h2>
 *
 * The contract's own words: "The state machine lives on the resource rather than on
 * action URLs." One endpoint means one place the transition guards run, and a client
 * that wants to know what is legal reads the status rather than probing five URLs.
 */
@RestController
@RequestMapping("/api/v1/refund-requests")
public class RefundRequestController {

    /** The contract's own defaults for this collection. */
    private static final int DEFAULT_SIZE = 10;
    private static final int MAX_SIZE = 100;

    private final RefundRequestService refundRequestService;

    RefundRequestController(RefundRequestService refundRequestService) {
        this.refundRequestService = refundRequestService;
    }

    /** The signed-in buyer's own refund requests, newest first. */
    @GetMapping
    public RefundRequestPageResponse listMine(
            @RequestParam(required = false) RefundStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + DEFAULT_SIZE) int size) {
        // Clamped rather than trusted: ?size=100000 is a full table read dressed up
        // as pagination, and ?page=-1 is an IllegalArgumentException from PageRequest.
        return refundRequestService.listForBuyer(
                status, PageRequest.of(Math.max(page, 0), clampSize(size)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RefundRequestDetailResponse create(@Valid @RequestBody CreateRefundRequestRequest request) {
        return refundRequestService.create(request);
    }

    @GetMapping("/{refundRequestId}")
    public RefundRequestDetailResponse get(@PathVariable UUID refundRequestId) {
        return refundRequestService.get(refundRequestId);
    }

    @PatchMapping("/{refundRequestId}")
    public RefundRequestDetailResponse update(
            @PathVariable UUID refundRequestId,
            @Valid @RequestBody UpdateRefundRequestRequest request) {
        return refundRequestService.update(refundRequestId, request);
    }

    private static int clampSize(int size) {
        if (size < 1) {
            return DEFAULT_SIZE;
        }
        return Math.min(size, MAX_SIZE);
    }
}
