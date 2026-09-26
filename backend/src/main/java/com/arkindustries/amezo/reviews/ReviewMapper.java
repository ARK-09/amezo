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
                projection.getVariantLabel(),
                projection.getReviewerName()
        );
    }

    /**
     * For a review this request just wrote or looked up by key, where there is no
     * native projection to hand - the variant label and reviewer name come from the
     * caller, which already resolved them.
     */
    static ReviewResponse toResponse(Review review, String variantLabel, String reviewerName) {
        return new ReviewResponse(
                review.getId(),
                review.getRating(),
                review.getBody(),
                review.getCreatedAt(),
                variantLabel,
                reviewerName
        );
    }
}
