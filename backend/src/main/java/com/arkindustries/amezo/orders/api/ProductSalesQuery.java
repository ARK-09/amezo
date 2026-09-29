package com.arkindustries.amezo.orders.api;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Which products actually sell, ranked by units shifted.
 *
 * <h2>Why this lives in orders rather than in catalog's own SQL</h2>
 *
 * "Best sellers" is a fact about ORDERS, not about the catalog: it is
 * {@code SUM(order_line.quantity)} grouped by product. Catalog is the feature that
 * needs to render it, and catalog may not read order_line - PackageBoundaryTest
 * fails the build on a cross-feature table join, and rightly so. So the ranking is
 * computed here, where the data lives, and published as ids.
 *
 * <h2>Ids, not products</h2>
 *
 * This returns product ids in rank order and nothing else. Orders has no business
 * deciding what a product looks like, whether it is still ACTIVE, or whether it
 * should be visible - all of that is catalog's, which loads the rows itself and
 * drops any the shopper should not see. A product sold a thousand times and since
 * archived ranks high here and does not appear on the storefront, which is the
 * correct division: this answers "what sold", catalog answers "what can be shown".
 *
 * <h2>Why a limit rather than a page</h2>
 *
 * The caller is a merchandising rail - a fixed, small number of tiles. Ranking the
 * whole catalog by sales to serve page 40 of it is a different query with different
 * costs, and nothing asks for it. If general "sort by best selling" paging is ever
 * wanted, that wants a maintained counter on the product row, not this.
 */
public interface ProductSalesQuery {

    /**
     * The best-selling product ids, most units first, at most {@code limit} of them.
     *
     * Ties break on the product id so that two products on identical sales do not
     * swap places between two identical calls - a "top five" whose fifth row changes
     * on every refresh is worse than one that is arbitrary but stable.
     *
     * @param since  only count lines sold at or after this moment; null counts all
     *               of history. A window is what makes "popular right now" mean
     *               something other than "sold well once, two years ago".
     * @param limit  at most this many ids. Must be positive.
     */
    List<UUID> bestSellingProductIds(Instant since, int limit);

    /**
     * The same ranking, narrowed to a given set of candidate products.
     *
     * For a category rail: catalog knows which products are in the category, orders
     * knows how they sold. Passing the candidates in keeps the category definition
     * where it belongs and still lets the ranking happen against the sales data.
     * An empty collection returns an empty list rather than every product.
     */
    List<UUID> bestSellingAmong(Collection<UUID> productIds, Instant since, int limit);
}
