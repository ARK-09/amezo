package com.arkindustries.amezo.reviews;

import com.arkindustries.amezo.reviews.dto.ReviewResponse;

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
