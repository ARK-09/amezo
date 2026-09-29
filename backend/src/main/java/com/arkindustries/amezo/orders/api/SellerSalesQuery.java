package com.arkindustries.amezo.orders.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Which sellers actually sell, ranked by units shifted.
 *
 * The store-level counterpart to {@link ProductSalesQuery}, and here for the same
 * reason: "best selling" is a fact about order_line, no other feature may read that
 * table, and the feature that needs to render it is not the one that owns it.
 *
 * <h2>Ids, not stores</h2>
 *
 * Orders has never heard of a storefront. It answers with seller ids in rank order;
 * identity decides whether each one has a store, whether that store is open, and
 * what a shopper may see of it. A seller who sold well and has since closed their
 * shop ranks high here and is not featured anywhere, which is the correct split:
 * this answers "who sold", identity answers "whose shop can be shown".
 */
public interface SellerSalesQuery {

    /**
     * The best-selling seller ids, most units first, at most {@code limit} of them.
     *
     * @param since only count lines sold at or after this moment; null counts all of
     *              history, which is the useful default for a young marketplace.
     * @param limit at most this many ids. Must be positive.
     */
    List<UUID> bestSellingSellerIds(Instant since, int limit);
}
