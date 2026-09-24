package com.arkindustries.marketplace.reviews.api;

/**
 * averageRating is null for a product with zero reviews - AVG() over no
 * rows is SQL NULL, not zero. count is always present (0 for no reviews).
 */
public record ReviewSummaryView(Double averageRating, Long count) {
}
