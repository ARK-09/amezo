package com.arkindustries.amezo.reviews.api;

import java.util.UUID;

/**
 * The only surface other features may depend on for review data. Anything
 * outside this package (Review, ReviewRepository, the service impl) is
 * off-limits to other features - see PackageBoundaryTest.
 */
public interface ReviewSummaryQuery {

    ReviewSummaryView getSummary(UUID productId);
}
