package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.ProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.ProductSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;

/**
 * GET /products (search + filters) and GET /products/{id} (detail), both public
 * under SecurityConfig's GET /products/** rule. Warranty filtering is still
 * deferred - it belongs to the offer-level warranty model in docs/next-build.md,
 * which isn't built.
 */
@RestController
@RequestMapping("/products")
public class ProductController {

    /** What the landing page's rails ask for, and what they are capped at. */
    private static final int DEFAULT_RAIL_SIZE = 10;
    private static final int MAX_RAIL_SIZE = 50;

    /** "New this week" means a week. Overridable, because the rail's copy might not. */
    private static final int DEFAULT_NEW_WINDOW_DAYS = 7;

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public Page<ProductSummaryResponse> search(
            @RequestParam(required = false) String q,
            // A category SLUG, from GET /categories. An unknown slug simply
            // matches nothing, so a stale bookmarked filter shows an empty result
            // rather than 400ing at the buyer.
            @RequestParam(required = false) String category,
            @RequestParam(required = false) BigDecimal priceMin,
            @RequestParam(required = false) BigDecimal priceMax,
            @RequestParam(required = false, defaultValue = "false") boolean inStockOnly,
            // Not an enum parameter: an unrecognised value falls through the
            // ORDER BY's CASE arms to the created_at tiebreak, so a stale
            // bookmarked URL sorts oddly instead of 400ing at the buyer.
            @RequestParam(required = false, defaultValue = "relevance") String sort,
            Pageable pageable) {
        return productService.search(q, category, null, priceMin, priceMax, inStockOnly, sort, pageable);
    }

    /**
     * GET /products/best-selling - the merchandising rail, ranked by units actually
     * sold.
     *
     * A separate route rather than {@code ?sort=best_selling} on the search above,
     * because it is not a sort: the ranking comes from another feature entirely
     * (orders owns order_line; see ProductService.bestSelling), so it cannot be an
     * ORDER BY inside the search query and cannot be paged with it. Pretending
     * otherwise would put a sort option in the contract that silently ignores every
     * filter beside it.
     *
     * "best-selling" is a reserved segment here, the same way /facets is on the
     * buyer's orders: Spring's PathPattern prefers a literal over the {productRef}
     * variable below, and no product slug may be this string.
     *
     * An empty array is a real answer - a marketplace with no orders has no best
     * sellers, and the rail removes itself rather than showing something else under
     * that heading.
     */
    @GetMapping("/best-selling")
    public Page<ProductSummaryResponse> bestSelling(
            @RequestParam(required = false) String category,
            // Null means all of history. A window is what separates "popular now"
            // from "sold well once, a year ago".
            @RequestParam(required = false) Integer withinDays,
            @RequestParam(required = false, defaultValue = "" + DEFAULT_RAIL_SIZE) int size) {

        return productService.bestSelling(category, since(withinDays), clampRailSize(size));
    }

    /**
     * GET /products/new - listings from the last {@code withinDays} days, newest first.
     *
     * The window is the point. Ordering by recency and labelling it "new this week"
     * is true only by accident; with no lower bound the newest product in the catalog
     * heads that rail however old it is. Here a quiet week returns nothing.
     */
    @GetMapping("/new")
    public Page<ProductSummaryResponse> newArrivals(
            @RequestParam(required = false, defaultValue = "" + DEFAULT_NEW_WINDOW_DAYS) int withinDays,
            @RequestParam(required = false, defaultValue = "" + DEFAULT_RAIL_SIZE) int size) {

        return productService.newArrivals(since(Math.max(1, withinDays)), clampRailSize(size));
    }

    /** The lower bound of a rail's window, or null for all of history. */
    private static Instant since(Integer withinDays) {
        return withinDays == null ? null : Instant.now().minus(Duration.ofDays(withinDays));
    }

    /**
     * A rail is a handful of tiles. Clamped rather than trusted so ?size=100000 is a
     * short rail instead of a request to rank and enrich the whole catalog.
     */
    private static int clampRailSize(int size) {
        return Math.min(Math.max(1, size), MAX_RAIL_SIZE);
    }

    /**
     * The path segment is the product's slug. A UUID is still accepted, and
     * resolves to the same product, so links and bookmarks from before slugs
     * existed keep working instead of 404ing - the frontend turns those into a
     * redirect to the slug URL.
     */
    @GetMapping("/{productRef}")
    public ProductDetailResponse getDetail(@PathVariable String productRef) {
        return productService.getDetail(productRef);
    }
}
