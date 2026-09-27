package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.dto.FacetListResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderRowDetailResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderRowPageResponse;
import com.arkindustries.amezo.orders.dto.UpdateSellerOrderRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * The Seller Orders screen's endpoints, under /api/v1 where the contract puts them.
 *
 * This is the route that was missing. The frontend has called
 * /api/v1/sellers/me/orders, /facets, /{orderId} and its PATCH since the seller
 * portal was built; the only controller that existed served the unprefixed
 * /sellers/me/orders with a different response shape, so every one of those calls
 * fell through to Spring's no-handler path and came back 404 - not 403, because
 * SecurityConfig's /api/v1/sellers/me/** matcher already lets a signed-in seller
 * through to a route that then was not there.
 *
 * {@link SellerOrderController} (unprefixed) is left alone: it is nothing the
 * frontend calls any more, but it is covered by tests and removing it is not this
 * change's business.
 *
 * Authorisation is SecurityConfig's, which requires hasRole("SELLER") for
 * /api/v1/sellers/me/**. No matcher is added here.
 */
@RestController
@RequestMapping("/api/v1/sellers/me/orders")
public class SellerOrderRowController {

    /** The contract's default, and what the design's Per page select opens on. */
    private static final int DEFAULT_SIZE = 20;

    private final SellerOrderRowService sellerOrderRowService;

    public SellerOrderRowController(SellerOrderRowService sellerOrderRowService) {
        this.sellerOrderRowService = sellerOrderRowService;
    }

    /**
     * `group` is taken as a raw String and parsed by {@link SellerOrderGroup}, not
     * bound to the enum by Spring: Spring matches enum constants exactly, so
     * ?group=to_pack would 400 with a message naming a Java constant rather than the
     * seller's tab. `sort` likewise, though an unknown sort falls back to the default
     * instead of refusing - see SellerOrderRowService.
     *
     * page and size are clamped here rather than trusted. ?page=-1 walked backwards
     * off the list and ?size=100000 was a request for every order a shop has ever
     * taken in one response.
     */
    @GetMapping
    public SellerOrderRowPageResponse listMine(
            @RequestParam(required = false) UUID productId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String group,
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "" + DEFAULT_SIZE) int size) {

        return sellerOrderRowService.listMine(
                productId, q, group, status, sort, Math.max(0, page), clampSize(size));
    }

    @GetMapping("/facets")
    public FacetListResponse facets(@RequestParam(required = false) String q) {
        return sellerOrderRowService.facetsForMine(q);
    }

    @GetMapping("/{orderId}")
    public SellerOrderRowDetailResponse getDetail(@PathVariable UUID orderId) {
        return sellerOrderRowService.getDetail(orderId);
    }

    /**
     * Advances the order. Replaces POST /sellers/me/orders/{id}/ship, which put the
     * verb in the path: the transition is a field on the resource now, and an illegal
     * one comes back as a 409 naming the move that was refused.
     */
    @PatchMapping("/{orderId}")
    public SellerOrderRowDetailResponse update(
            @PathVariable UUID orderId, @Valid @RequestBody UpdateSellerOrderRequest request) {
        return sellerOrderRowService.update(orderId, request);
    }

    /** One row minimum, one page of the design's largest option at most. */
    private static int clampSize(int size) {
        return Math.min(Math.max(1, size), 100);
    }
}
