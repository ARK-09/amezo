package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.CategoryResponse;
import com.arkindustries.amezo.catalog.dto.ProductSummaryPageResponse;
import com.arkindustries.amezo.catalog.dto.ProductSummaryResponse;
import com.arkindustries.amezo.catalog.dto.PublicStoreResponse;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.identity.api.PublicStoreProfile;
import com.arkindustries.amezo.identity.api.PublicStoreQuery;
import com.arkindustries.amezo.reviews.api.ReviewSummaryQuery;
import com.arkindustries.amezo.reviews.api.ReviewSummaryView;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The public storefront: GET /api/v1/stores/{handle} and its listings.
 *
 * <h2>Why this lives in catalog and not in identity</h2>
 *
 * identity owns seller_store, so it answers "whose storefront is at this handle"
 * ({@link PublicStoreQuery}). Everything else on the page is catalogue data - the
 * product count, the in-stock count, the category chips, the rating, and the listings
 * themselves. Assembling it here needs eleven fields out of identity; assembling it in
 * identity would have needed the whole paged ProductSummary shape out of catalog. The
 * smaller cross-feature surface wins.
 *
 * <h2>The relationship this endpoint finally makes usable</h2>
 *
 * product.seller_id -> seller <- seller_store.seller_id, with seller_store.seller_id
 * UNIQUE (V18) so the join is unambiguous. There is no product.store_id and none is
 * needed. Before this, a storefront was found by reading one page of GET /products and
 * matching brandName in the browser, which capped a store at whatever fitted in that
 * page and matched on a display string rather than a key.
 */
@Service
public class StorefrontService {

    /** The design's default page of listings. */
    static final int DEFAULT_SIZE = 20;

    private final PublicStoreQuery publicStoreQuery;
    private final ProductRepository productRepository;
    private final ProductService productService;
    private final CategoryService categoryService;
    private final ReviewSummaryQuery reviewSummaryQuery;

    public StorefrontService(
            PublicStoreQuery publicStoreQuery,
            ProductRepository productRepository,
            ProductService productService,
            CategoryService categoryService,
            ReviewSummaryQuery reviewSummaryQuery) {
        this.publicStoreQuery = publicStoreQuery;
        this.productRepository = productRepository;
        this.productService = productService;
        this.categoryService = categoryService;
        this.reviewSummaryQuery = reviewSummaryQuery;
    }

    @Transactional(readOnly = true)
    public PublicStoreResponse getByHandle(String handle) {
        PublicStoreProfile store = requireStore(handle);
        UUID sellerId = store.sellerId();

        ReviewSummaryView rating = ratingFor(sellerId);

        return PublicStoreResponse.of(
                sellerId,
                store.name(),
                store.handle(),
                store.tagline(),
                store.location(),
                store.about(),
                store.coverUrl(),
                store.logoUrl(),
                store.status(),
                store.vacationNote(),
                productRepository.countActiveForSeller(sellerId),
                productRepository.countInStockForSeller(sellerId),
                rating.averageRating(),
                rating.count() == null ? 0L : rating.count(),
                categoriesFor(sellerId),
                store.joinedAt());
    }

    /**
     * This store's listings, filtered, sorted and paged by the server.
     *
     * Runs through ProductService.search with the store's seller id, so the storefront
     * and the search page are ONE pipeline: a store cannot advertise a product the
     * search page will not show, and its own counts cannot disagree with the list they
     * open.
     */
    @Transactional(readOnly = true)
    public ProductSummaryPageResponse listProducts(
            String handle, String q, String category, String sort, int page, int size) {

        UUID sellerId = requireStore(handle).sellerId();
        Page<ProductSummaryResponse> results = productService.search(
                blankToNull(q),
                blankToNull(category),
                sellerId,
                null,
                null,
                false,
                toSearchSort(sort),
                PageRequest.of(Math.max(0, page), clampSize(size)));

        return new ProductSummaryPageResponse(
                results.getContent(),
                results.getNumber(),
                results.getTotalElements(),
                // One page minimum: an empty store is "page 1 of 1", not "of 0", so the
                // pager prints a page that exists.
                Math.max(1, results.getTotalPages()));
    }

    private PublicStoreProfile requireStore(String handle) {
        return publicStoreQuery.findByHandle(handle)
                .orElseThrow(() -> new NotFoundException("Store '" + handle + "' not found"));
    }

    /**
     * The store's rating, derived from its products' reviews.
     *
     * A weighted mean, not an average of averages: a product with forty reviews says
     * more about this shop than one with a single five-star. Note this is NOT seller
     * feedback - nothing in this system rates how a shop trades, which is why
     * positiveRatingPct stays null - it is the reviews its catalogue has earned.
     *
     * Null average with a zero count for a store nobody has reviewed, which the
     * storefront prints as no rating at all rather than as zero stars.
     */
    private ReviewSummaryView ratingFor(UUID sellerId) {
        List<UUID> productIds = productRepository.activeProductIdsForSeller(sellerId);
        if (productIds.isEmpty()) {
            return new ReviewSummaryView(null, 0L);
        }

        Map<UUID, ReviewSummaryView> summaries = reviewSummaryQuery.getSummaries(productIds);
        long total = 0L;
        double weighted = 0.0;
        for (ReviewSummaryView summary : summaries.values()) {
            if (summary.averageRating() == null || summary.count() == null || summary.count() == 0L) {
                continue;
            }
            total += summary.count();
            weighted += summary.averageRating() * summary.count();
        }
        return total == 0L ? new ReviewSummaryView(null, 0L) : new ReviewSummaryView(weighted / total, total);
    }

    /**
     * The categories this store lists in, in the system's merchandising order rather
     * than in whatever order the distinct query returned them.
     */
    private List<CategoryResponse> categoriesFor(UUID sellerId) {
        Set<UUID> mine = new HashSet<>(productRepository.activeCategoryIdsForSeller(sellerId));
        if (mine.isEmpty()) {
            return List.of();
        }
        Set<String> mySlugs = categoryService.byId().entrySet().stream()
                .filter(entry -> mine.contains(entry.getKey()))
                .map(entry -> entry.getValue().slug())
                .collect(Collectors.toSet());

        List<CategoryResponse> ordered = categoryService.listSelectable().stream()
                .filter(category -> mySlugs.contains(category.slug()))
                .collect(Collectors.toCollection(ArrayList::new));

        // A retired category a product still holds is not in the selectable list at
        // all. It is still shown - the product really is listed under it - just after
        // the live ones rather than dropped.
        Set<String> shown = ordered.stream().map(CategoryResponse::slug).collect(Collectors.toSet());
        categoryService.byId().values().stream()
                .filter(category -> mySlugs.contains(category.slug()) && !shown.contains(category.slug()))
                .sorted(Comparator.comparing(CategoryResponse::name))
                .forEach(ordered::add);

        return List.copyOf(ordered);
    }

    /**
     * The storefront's sort vocabulary, mapped onto the catalogue search's.
     *
     * Two vocabularies for one thing is what broke the buyer order facets, so this is
     * the one place the translation happens. `rating` has no arm in the search query's
     * ORDER BY - nothing sorts by an aggregate from another feature - so it falls
     * through to the created_at tiebreak, exactly as an unknown sort does on the search
     * page. Honest, and the only alternative is sorting a page of results in the
     * browser and calling it a catalogue sort.
     */
    private static String toSearchSort(String sort) {
        if (sort == null) {
            return "relevance";
        }
        return switch (sort.trim().toLowerCase(Locale.ROOT)) {
            case "priceasc", "price_asc" -> "price_asc";
            case "pricedesc", "price_desc" -> "price_desc";
            default -> "relevance";
        };
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static int clampSize(int size) {
        return Math.min(Math.max(1, size), 100);
    }
}
