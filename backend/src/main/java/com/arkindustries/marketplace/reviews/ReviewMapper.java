package com.arkindustries.marketplace.reviews;

import com.arkindustries.marketplace.reviews.dto.ReviewResponse;

// Package-private: only ReviewService uses this.
class ReviewMapper {

    static ReviewResponse toResponse(ReviewWithVariantLabelProjection projection) {
        return new ReviewResponse(
                projection.getId(),
                projection.getRating(),
                projection.getBody(),
                projection.getCreatedAt(),
                projection.getVariantLabel()
        );
    }
}
