package com.arkindustries.amezo.catalog;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {

    Page<Product> findBySellerId(UUID sellerId, Pageable pageable);

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
     * price_from is MIN(offer.price) across the product's variants - the number
     * shown on a card - so a price filter accepts a product whose cheapest offer
     * falls in the range, and inStockOnly keeps products with at least one offer
     * still holding stock. Products with no offers at all keep a NULL aggregate:
     * they survive an unfiltered search and drop out of any price or stock filter
     * rather than being silently treated as free or in stock.
     */
    @Query(
        value = "SELECT p.* FROM product p " +
                "LEFT JOIN LATERAL (" +
                "  SELECT MIN(o.price) AS price_from, MAX(o.stock_qty) AS max_stock " +
                "  FROM variant v JOIN offer o ON o.variant_id = v.id " +
                "  WHERE v.product_id = p.id" +
                ") agg ON TRUE " +
                "WHERE (CAST(:query AS text) IS NULL " +
                "       OR p.search_vector @@ plainto_tsquery('english', CAST(:query AS text))) " +
                "  AND (CAST(:category AS text) IS NULL OR p.category = CAST(:category AS text)) " +
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
                "LEFT JOIN LATERAL (" +
                "  SELECT MIN(o.price) AS price_from, MAX(o.stock_qty) AS max_stock " +
                "  FROM variant v JOIN offer o ON o.variant_id = v.id " +
                "  WHERE v.product_id = p.id" +
                ") agg ON TRUE " +
                "WHERE (CAST(:query AS text) IS NULL " +
                "       OR p.search_vector @@ plainto_tsquery('english', CAST(:query AS text))) " +
                "  AND (CAST(:category AS text) IS NULL OR p.category = CAST(:category AS text)) " +
                "  AND (CAST(:priceMin AS numeric) IS NULL OR agg.price_from >= CAST(:priceMin AS numeric)) " +
                "  AND (CAST(:priceMax AS numeric) IS NULL OR agg.price_from <= CAST(:priceMax AS numeric)) " +
                "  AND (CAST(:inStockOnly AS boolean) = FALSE OR COALESCE(agg.max_stock, 0) > 0)",
        nativeQuery = true
    )
    Page<Product> search(
            @Param("query") String query,
            @Param("category") String category,
            @Param("priceMin") BigDecimal priceMin,
            @Param("priceMax") BigDecimal priceMax,
            @Param("inStockOnly") boolean inStockOnly,
            @Param("sort") String sort,
            Pageable pageable);
}
