package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.common.exception.UnprocessableEntityException;
import com.arkindustries.amezo.orders.dto.BuyerOrderDetailResponse;
import com.arkindustries.amezo.orders.dto.BuyerOrderSummaryPageResponse;
import com.arkindustries.amezo.orders.dto.FacetListResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * The buyer's My Orders surface: GET /api/v1/orders, /facets and /{orderId}.
 *
 * Under /api/v1 and not beside the existing unprefixed /orders, which is guest
 * checkout's POST. Two prefixes coexisting is the accepted interim state (see
 * docs/backend-handoff.md and the note in fixture.yaml): everything designed in
 * this round is versioned, and migrating the older paths is a separate,
 * cross-cutting change that would break the buyer app mid-flight.
 *
 * A SEPARATE CONTROLLER from OrderController even though both answer under
 * "/orders". OrderController is public - SecurityConfig permits POST /orders for
 * guest checkout - and these three routes are buyer-scoped. Putting a route that
 * must never be anonymous in the same class as one that must always be reachable
 * anonymously is how the wrong @RequestMapping ends up one refactor away from
 * exposing an order history.
 *
 * Authorization is the route's, not this class's: SecurityConfig scopes
 * GET /api/v1/orders/** to hasRole("BUYER"), so a missing cookie is 401 and a
 * seller's cookie is 403 before any method here runs. Ownership WITHIN that role
 * is BuyerOrderService's - the role is the door, the buyer_identity_id check is
 * the lock.
 */
@RestController
@RequestMapping("/api/v1/orders")
public class BuyerOrderController {

    /**
     * The contract's default, and the page size MyOrders.tsx opens on.
     *
     * The upper bound is not in the contract and is deliberate: `size` reaches a
     * subList directly, and ?size=100000 is a request for a buyer's entire history
     * in one response. The client offers 5/10/20/50, so 100 is generous without
     * being a way to ask the server to build an unbounded list.
     */
    private static final int DEFAULT_SIZE = 10;
    private static final int MAX_SIZE = 100;

    private final BuyerOrderService buyerOrderService;

    public BuyerOrderController(BuyerOrderService buyerOrderService) {
        this.buyerOrderService = buyerOrderService;
    }

    @GetMapping
    public BuyerOrderSummaryPageResponse listMine(
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) String group,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + DEFAULT_SIZE) int size) {

        return buyerOrderService.listMine(
                status,
                BuyerOrderGroup.from(group),
                q,
                from,
                to,
                requireNonNegativePage(page),
                requireUsableSize(size));
    }

    /**
     * Mapped BEFORE /{orderId} would match it. Spring's PathPattern prefers the
     * more specific literal over a variable, so the order of these two methods in
     * the file does not decide it - but /facets is a reserved segment either way,
     * and an order whose uuid was the literal string "facets" is not a thing that
     * can exist.
     */
    @GetMapping("/facets")
    public FacetListResponse facetsForMine(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String period) {

        return buyerOrderService.facetsForMine(q, BuyerOrderPeriod.from(period));
    }

    @GetMapping("/{orderId}")
    public BuyerOrderDetailResponse getMine(@PathVariable UUID orderId) {
        return buyerOrderService.getMine(orderId);
    }

    /**
     * A negative page is a 422 naming the field rather than a silent clamp to 0.
     * Spring has already refused anything that is not an integer at all with its
     * own type-mismatch 400; this is the check that parses fine and still cannot be
     * acted on, which is exactly what UnprocessableEntityException is for.
     */
    private static int requireNonNegativePage(int page) {
        if (page < 0) {
            throw invalid("page", "must be 0 or greater", "page was " + page);
        }
        return page;
    }

    private static int requireUsableSize(int size) {
        if (size < 1 || size > MAX_SIZE) {
            throw invalid("size", "must be between 1 and " + MAX_SIZE, "size was " + size);
        }
        return size;
    }

    private static UnprocessableEntityException invalid(String field, String reason, String detail) {
        return new UnprocessableEntityException(
                URI.create("https://api/errors/validation"),
                "Validation failed",
                detail,
                List.of(new UnprocessableEntityException.FieldError(field, reason)));
    }
}
