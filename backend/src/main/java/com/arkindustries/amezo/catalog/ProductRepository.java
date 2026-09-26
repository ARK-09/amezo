package com.arkindustries.amezo.catalog;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
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
                "  AND (CAST(:inStockOnly AS boolean) = FALSE OR COALESCE(agg.max_stock, 0) > 0)",
        nativeQuery = true
    )
    Page<Product> search(
            @Param("query") String query,
            @Param("categorySlug") String categorySlug,
            @Param("priceMin") BigDecimal priceMin,
            @Param("priceMax") BigDecimal priceMax,
            @Param("inStockOnly") boolean inStockOnly,
            @Param("sort") String sort,
            Pageable pageable);

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
