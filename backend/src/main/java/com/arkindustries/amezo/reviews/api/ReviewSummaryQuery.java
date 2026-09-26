package com.arkindustries.amezo.reviews.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * The only surface other features may depend on for review data. Anything
 * outside this package (Review, ReviewRepository, the service impl) is
 * off-limits to other features - see PackageBoundaryTest.
 */
public interface ReviewSummaryQuery {

    ReviewSummaryView getSummary(UUID productId);

    /**
     * The same aggregate for a whole page of products in one query. This exists so
     * search results can carry a real rating: doing it one product at a time made a
     * page of sixteen cards sixteen extra queries, which is why avgRating sat unset
     * in the contract until now.
     *
     * Products with no reviews are absent from the map rather than present with a
     * null average - the caller is mapping a page and already treats "no entry" as
     * "no rating".
     */
    Map<UUID, ReviewSummaryView> getSummaries(Collection<UUID> productIds);
}
