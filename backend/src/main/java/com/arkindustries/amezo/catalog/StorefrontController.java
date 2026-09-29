package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.ProductSummaryPageResponse;
import com.arkindustries.amezo.catalog.dto.PublicStoreResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The public storefront - the last piece of the store/product relationship.
 *
 * Both of these routes existed only in the contract and in MSW. Against the real
 * backend the store page got a 403 from SecurityConfig's anyRequest().denyAll(),
 * because nothing served /api/v1/stores/** and no matcher named it. A shopper could
 * reach a seller's products only through search.
 *
 * Public on purpose: this is a shop window. SecurityConfig permits GET on these two
 * paths and nothing else under /api/v1/stores - the follow and message endpoints the
 * contract also declares have no backend and no matcher, so they still refuse rather
 * than half-working.
 */
@RestController
@RequestMapping("/api/v1/stores")
public class StorefrontController {

    /** The landing page asks for one. Clamped so ?size=100000 is not a full scan. */
    private static final int DEFAULT_FEATURED = 1;
    private static final int MAX_FEATURED = 10;

    private final StorefrontService storefrontService;

    public StorefrontController(StorefrontService storefrontService) {
        this.storefrontService = storefrontService;
    }

    /**
     * GET /stores/featured - the storefronts the landing page puts forward.
     *
     * Declared here as a literal segment beside {handle}, which Spring prefers over
     * the path variable whatever the declaration order. "featured" is reserved as a
     * store handle (identity's StoreHandles) so no shop can be shadowed by it.
     *
     * An empty array is a real answer - a marketplace with no open, stocked shop has
     * nobody to feature - and the panel drops itself rather than naming a shop that
     * is closed or has nothing to sell.
     */
    @GetMapping("/featured")
    public List<PublicStoreResponse> featured(
            @RequestParam(required = false, defaultValue = "" + DEFAULT_FEATURED) int size) {
        return storefrontService.featured(Math.min(Math.max(1, size), MAX_FEATURED));
    }

    /** A handle that names no store is a 404, never a provisioned empty storefront. */
    @GetMapping("/{handle}")
    public PublicStoreResponse getStore(@PathVariable String handle) {
        return storefrontService.getByHandle(handle);
    }

    /**
     * This store's listings. q searches within this store only, and page/size are
     * clamped rather than trusted - ?size=100000 is a full catalogue read dressed up as
     * pagination.
     */
    @GetMapping("/{handle}/products")
    public ProductSummaryPageResponse getStoreProducts(
            @PathVariable String handle,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "" + StorefrontService.DEFAULT_SIZE) int size) {

        return storefrontService.listProducts(handle, q, category, sort, page, size);
    }
}
