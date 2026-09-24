package com.arkindustries.marketplace.catalog.dto;

/**
 * catalog's own shape for this, mapped from reviews.api.ReviewSummaryView -
 * kept separate so catalog's HTTP contract doesn't directly leak another
 * feature's internal DTO, even though the fields are identical today.
 */
public record ReviewSummaryResponse(Double averageRating, long count) {
}
