package com.arkindustries.amezo.catalog;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {

    Page<Product> findBySellerId(UUID sellerId, Pageable pageable);

    Optional<Product> findBySlug(String slug);

    boolean existsBySlug(String slug);

    /**
     * Search plus the catalog filters, in one query. Native because none of it is
     * expressible in JPQL: the tsvector match, the lateral aggregate over each
     * product's offers, and ordering by that aggregate.
     *
     * Every parameter is CAST before use, including in its own IS NULL test.
     * Postgres cannot infer the type of a bare placeholder in "$1 IS NULL", and
     * without the cast the whole statement fails to prepare - the filters being
     * optional is exactly why each one is compared against NULL first.
     *
     * The category filter takes a SLUG and joins the category table rather than
     * comparing a denormalised name: the slug is the stable value a bookmarked
     * ?category= URL carries, so renaming a category cannot break a saved filter.
     *
     * price_from is MIN(offer.price) across the product's variants - the number
     * shown on a card - so a price filter accepts a product whose cheapest offer
     * falls in the range, and inStockOnly keeps products with at least one offer
     * still holding stock. Products with no offers at all keep a NULL aggregate:
     * they survive an unfiltered search and drop out of any price or stock filter
     * rather than being silently treated as free or in stock.
     *
     * sellerId is what makes this ONE pipeline serve both the search page and a
     * storefront's listings (GET /api/v1/stores/{handle}/products). A second query
     * for the store page is how a storefront ends up advertising a product the
     * search page will not show, or a count the listings endpoint disagrees with.
     *
     * {@code p.status = 'ACTIVE'} is unconditional and is a FIX, not a filter the
     * caller chose. product.status exists to say "whether a listing is visible to
     * shoppers" (V17, ProductStatus), the seller's own query has always honoured it -
     * and this one did not, so every DRAFT listing was publicly searchable. Not a
     * parameter, because there is no version of a public search that should return a
     * draft.
     */
    @Query(
        value = "SELECT p.* FROM product p " +
                "JOIN category cat ON cat.id = p.category_id " +
                "LEFT JOIN LATERAL (" +
                "  SELECT MIN(o.price) AS price_from, MAX(o.stock_qty) AS max_stock " +
                "  FROM variant v JOIN offer o ON o.variant_id = v.id " +
                "  WHERE v.product_id = p.id" +
                ") agg ON TRUE " +
                "WHERE (CAST(:query AS text) IS NULL " +
                "       OR p.search_vector @@ plainto_tsquery('english', CAST(:query AS text))) " +
                "  AND (CAST(:categorySlug AS text) IS NULL OR cat.slug = CAST(:categorySlug AS text)) " +
                "  AND (CAST(:priceMin AS numeric) IS NULL OR agg.price_from >= CAST(:priceMin AS numeric)) " +
                "  AND (CAST(:priceMax AS numeric) IS NULL OR agg.price_from <= CAST(:priceMax AS numeric)) " +
                "  AND (CAST(:inStockOnly AS boolean) = FALSE OR COALESCE(agg.max_stock, 0) > 0) " +
                "  AND (CAST(:sellerId AS uuid) IS NULL OR p.seller_id = CAST(:sellerId AS uuid)) " +
                "  AND p.status = 'ACTIVE' " +
                "ORDER BY " +
                "  CASE WHEN CAST(:sort AS text) = 'relevance' AND CAST(:query AS text) IS NOT NULL " +
                "       THEN ts_rank(p.search_vector, plainto_tsquery('english', CAST(:query AS text))) END DESC NULLS LAST, " +
                "  CASE WHEN CAST(:sort AS text) = 'price_asc' THEN agg.price_from END ASC NULLS LAST, " +
                "  CASE WHEN CAST(:sort AS text) = 'price_desc' THEN agg.price_from END DESC NULLS LAST, " +
                // Final tiebreak, and what 'newest' resolves to on its own. Also
                // makes paging deterministic: without a total order, two pages of
                // equally-ranked rows can repeat or skip products.
                "  p.created_at DESC, p.id",
        countQuery = "SELECT count(*) FROM product p " +
                "JOIN category cat ON cat.id = p.category_id " +
                "LEFT JOIN LATERAL (" +
                "  SELECT MIN(o.price) AS price_from, MAX(o.stock_qty) AS max_stock " +
                "  FROM variant v JOIN offer o ON o.variant_id = v.id " +
                "  WHERE v.product_id = p.id" +
                ") agg ON TRUE " +
                "WHERE (CAST(:query AS text) IS NULL " +
                "       OR p.search_vector @@ plainto_tsquery('english', CAST(:query AS text))) " +
                "  AND (CAST(:categorySlug AS text) IS NULL OR cat.slug = CAST(:categorySlug AS text)) " +
                "  AND (CAST(:priceMin AS numeric) IS NULL OR agg.price_from >= CAST(:priceMin AS numeric)) " +
                "  AND (CAST(:priceMax AS numeric) IS NULL OR agg.price_from <= CAST(:priceMax AS numeric)) " +
                "  AND (CAST(:inStockOnly AS boolean) = FALSE OR COALESCE(agg.max_stock, 0) > 0) " +
                "  AND (CAST(:sellerId AS uuid) IS NULL OR p.seller_id = CAST(:sellerId AS uuid)) " +
                "  AND p.status = 'ACTIVE'",
        nativeQuery = true
    )
    Page<Product> search(
            @Param("query") String query,
            @Param("categorySlug") String categorySlug,
            @Param("sellerId") UUID sellerId,
            @Param("priceMin") BigDecimal priceMin,
            @Param("priceMax") BigDecimal priceMax,
            @Param("inStockOnly") boolean inStockOnly,
            @Param("sort") String sort,
            Pageable pageable);

    /**
     * How many listings a storefront has, and how many of them can be bought right
     * now - PublicStore.productCount and inStockCount.
     *
     * ACTIVE only, the same rule the public search applies: a storefront must not
     * advertise a count that includes drafts the shopper cannot see. Counted in the
     * database rather than by loading the store's products, because the number is all
     * the header prints.
     */
    @Query(value = "SELECT count(*) FROM product p "
            + "WHERE p.seller_id = :sellerId AND p.status = 'ACTIVE'",
            nativeQuery = true)
    long countActiveForSeller(@Param("sellerId") UUID sellerId);

    @Query(value = "SELECT count(*) FROM product p "
            + "WHERE p.seller_id = :sellerId AND p.status = 'ACTIVE' "
            + "  AND EXISTS (SELECT 1 FROM variant v JOIN offer o ON o.variant_id = v.id "
            + "              WHERE v.product_id = p.id AND o.stock_qty > 0)",
            nativeQuery = true)
    long countInStockForSeller(@Param("sellerId") UUID sellerId);

    /**
     * The categories a storefront actually lists in, for its filter chips.
     *
     * Ids rather than whole rows: the caller already holds the category table as a map
     * (CategoryService.byId) and needs it in merchandising order, which this cannot
     * give. Not derivable on the client either - a page of listings only knows its own
     * page, and the system category list would offer categories this seller does not
     * sell.
     */
    @Query(value = "SELECT DISTINCT p.category_id FROM product p "
            + "WHERE p.seller_id = :sellerId AND p.status = 'ACTIVE'",
            nativeQuery = true)
    List<UUID> activeCategoryIdsForSeller(@Param("sellerId") UUID sellerId);

    /**
     * The ids of a storefront's listings, for the one figure that cannot be counted in
     * this feature's own tables: its rating. Reviews live in another feature and are
     * asked for by product id (reviews.api.ReviewSummaryQuery), so the ids have to
     * come out first.
     *
     * Bounded by ONE STORE'S CATALOGUE. A shop with ten thousand listings would send
     * ten thousand ids into that IN clause, which is the same judgement call - and the
     * same caveat - as BuyerOrderService's window. Said plainly so the day that shop
     * exists, this is where the fix starts: a seller-scoped aggregate on reviews' side.
     */
    @Query(value = "SELECT p.id FROM product p "
            + "WHERE p.seller_id = :sellerId AND p.status = 'ACTIVE'",
            nativeQuery = true)
    List<UUID> activeProductIdsForSeller(@Param("sellerId") UUID sellerId);

    /**
     * Sellers with the most listings, most first.
     *
     * The fallback ranking for the featured-store rail. Sales are the better signal
     * and the rail prefers them, but a marketplace on its first day has none - and
     * "no orders yet" is not a reason to show an empty panel where a shop should be.
     * A seller with nothing listed is not in the answer at all: featuring a storefront
     * a shopper would find empty is worse than featuring nobody.
     *
     * Tie-broken on seller_id so two shops with the same number of listings do not
     * swap the front page between refreshes.
     */
    @Query(value = "SELECT p.seller_id FROM product p "
            + "WHERE p.status = 'ACTIVE' "
            + "GROUP BY p.seller_id "
            + "ORDER BY count(*) DESC, p.seller_id "
            + "LIMIT :limit",
            nativeQuery = true)
    List<UUID> sellerIdsWithMostActiveListings(@Param("limit") int limit);

    /**
     * The active products in a category, as ids.
     *
     * For the best-selling category rail: catalog knows what is IN a category and
     * what may be shown, orders knows how it sold. Passing these to
     * orders.api.ProductSalesQuery keeps the category definition here and the
     * ranking there, rather than teaching either feature about the other's tables.
     */
    @Query(value = "SELECT p.id FROM product p "
            + "JOIN category cat ON cat.id = p.category_id "
            + "WHERE cat.slug = CAST(:categorySlug AS text) AND p.status = 'ACTIVE'",
            nativeQuery = true)
    List<UUID> activeProductIdsInCategory(@Param("categorySlug") String categorySlug);

    /**
     * Active products by id, for a ranking computed somewhere other than this query.
     *
     * Returns them in whatever order the database likes - the CALLER re-imposes the
     * rank it asked for. Sorting here would mean passing the ranking into SQL just to
     * read it back out.
     *
     * Silently drops ids that are no longer ACTIVE or no longer exist, which is the
     * point: orders ranks what SOLD, and a product archived since its best month must
     * not reappear on the storefront because of it.
     */
    @Query(value = "SELECT p.* FROM product p WHERE p.id IN (:ids) AND p.status = 'ACTIVE'",
            nativeQuery = true)
    List<Product> findActiveByIdIn(@Param("ids") Collection<UUID> ids);

    /**
     * Products listed since a given moment, newest first.
     *
     * The whole point of the {@code since} bound: "New this week" used to be an
     * ORDER BY with no WHERE, so the newest product in the catalog appeared under
     * that heading however old it was. A rail that claims a time window has to
     * actually apply one, and an empty result is the honest answer for a quiet week.
     *
     * Tie-broken on id so two products listed in the same millisecond - which is
     * every product in a seeded database - do not swap places between refreshes.
     */
    @Query(value = "SELECT p.* FROM product p "
            + "WHERE p.status = 'ACTIVE' AND p.created_at >= CAST(:since AS timestamptz) "
            + "ORDER BY p.created_at DESC, p.id "
            + "LIMIT :limit",
            nativeQuery = true)
    List<Product> newArrivals(@Param("since") Instant since, @Param("limit") int limit);

    /**
     * The seller's own catalogue, filtered and sorted the way their products
     * screen asks for it. The counterpart to search() above, and native for the
     * same reasons: an aggregate over each product's offers that both a filter
     * and a sort read, which JPQL cannot express.
     *
     * Every parameter is CAST before use, including inside its own IS NULL test.
     * Postgres cannot infer the type of a bare placeholder in "$1 IS NULL" and
     * the whole statement then fails to prepare - see search()'s note; the
     * filters being optional is exactly why each is compared against NULL first.
     *
     * q matches title, brand and SKU, per the contract. It does NOT use
     * search_vector, which the buyer-facing search uses: that tsvector is built
     * from title, brand and description (V5) and contains no SKU at all, and a
     * seller looking for "AUR-1-MDN" is nearly always typing a SKU. ILIKE with a
     * leading wildcard cannot use an index, which is the right trade here - this
     * runs against one seller's catalogue, not the whole table.
     *
     * total_stock is SUM over the product's offers, so stockBelow means what the
     * row prints. A product with no offers at all keeps a NULL aggregate and is
     * COALESCEd to 0: it has no stock, which is true, and it stays visible in an
     * unfiltered list instead of vanishing from the seller's own catalogue.
     */
    @Query(
        value = "SELECT p.* FROM product p " +
                "JOIN category cat ON cat.id = p.category_id " +
                "LEFT JOIN LATERAL (" +
                "  SELECT MIN(o.price) AS price_from, SUM(o.stock_qty) AS total_stock " +
                "  FROM variant v JOIN offer o ON o.variant_id = v.id " +
                "  WHERE v.product_id = p.id" +
                ") agg ON TRUE " +
                "WHERE p.seller_id = :sellerId " +
                "  AND (CAST(:query AS text) IS NULL " +
                "       OR p.title ILIKE '%' || CAST(:query AS text) || '%' " +
                "       OR COALESCE(p.brand_name, '') ILIKE '%' || CAST(:query AS text) || '%' " +
                "       OR EXISTS (SELECT 1 FROM variant vq WHERE vq.product_id = p.id " +
                "                  AND vq.sku ILIKE '%' || CAST(:query AS text) || '%')) " +
                "  AND (CAST(:status AS text) IS NULL OR p.status = CAST(:status AS text)) " +
                "  AND (CAST(:categorySlug AS text) IS NULL OR cat.slug = CAST(:categorySlug AS text)) " +
                "  AND (CAST(:stockBelow AS integer) IS NULL " +
                "       OR COALESCE(agg.total_stock, 0) < CAST(:stockBelow AS integer)) " +
                "ORDER BY " +
                // One CASE per sort option, all but the selected one evaluating to
                // NULL and therefore tying. lower() on the title so "apple" and
                // "Apple" sort together rather than in two ASCII blocks.
                "  CASE WHEN CAST(:sort AS text) = 'title_asc' THEN lower(p.title) END ASC, " +
                "  CASE WHEN CAST(:sort AS text) = 'title_desc' THEN lower(p.title) END DESC, " +
                "  CASE WHEN CAST(:sort AS text) = 'price_asc' THEN agg.price_from END ASC NULLS LAST, " +
                "  CASE WHEN CAST(:sort AS text) = 'price_desc' THEN agg.price_from END DESC NULLS LAST, " +
                "  CASE WHEN CAST(:sort AS text) = 'stock_asc' THEN COALESCE(agg.total_stock, 0) END ASC, " +
                "  CASE WHEN CAST(:sort AS text) = 'oldest' THEN p.created_at END ASC, " +
                // Final tiebreak, and what 'newest' resolves to on its own. Also
                // makes paging deterministic: without a total order, two pages of
                // equally-ranked rows can repeat or skip products.
                "  p.created_at DESC, p.id",
        countQuery = "SELECT count(*) FROM product p " +
                "JOIN category cat ON cat.id = p.category_id " +
                "LEFT JOIN LATERAL (" +
                "  SELECT SUM(o.stock_qty) AS total_stock " +
                "  FROM variant v JOIN offer o ON o.variant_id = v.id " +
                "  WHERE v.product_id = p.id" +
                ") agg ON TRUE " +
                "WHERE p.seller_id = :sellerId " +
                "  AND (CAST(:query AS text) IS NULL " +
                "       OR p.title ILIKE '%' || CAST(:query AS text) || '%' " +
                "       OR COALESCE(p.brand_name, '') ILIKE '%' || CAST(:query AS text) || '%' " +
                "       OR EXISTS (SELECT 1 FROM variant vq WHERE vq.product_id = p.id " +
                "                  AND vq.sku ILIKE '%' || CAST(:query AS text) || '%')) " +
                "  AND (CAST(:status AS text) IS NULL OR p.status = CAST(:status AS text)) " +
                "  AND (CAST(:categorySlug AS text) IS NULL OR cat.slug = CAST(:categorySlug AS text)) " +
                "  AND (CAST(:stockBelow AS integer) IS NULL " +
                "       OR COALESCE(agg.total_stock, 0) < CAST(:stockBelow AS integer))",
        nativeQuery = true
    )
    Page<Product> searchMine(
            @Param("sellerId") UUID sellerId,
            @Param("query") String query,
            @Param("status") String status,
            @Param("categorySlug") String categorySlug,
            @Param("stockBelow") Integer stockBelow,
            @Param("sort") String sort,
            Pageable pageable);
}
