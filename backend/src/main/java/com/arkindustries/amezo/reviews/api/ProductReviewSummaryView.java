package com.arkindustries.amezo.reviews.api;

import java.util.UUID;

/** One product's aggregate, for the batch form of ReviewSummaryQuery. */
public record ProductReviewSummaryView(UUID productId, Double averageRating, Long count) {
}
