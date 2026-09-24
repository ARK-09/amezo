package com.arkindustries.amezo.reviews;

import com.arkindustries.amezo.reviews.api.ReviewSummaryQuery;
import com.arkindustries.amezo.reviews.api.ReviewSummaryView;
import org.springframework.stereotype.Service;

import java.util.UUID;

// Package-private: catalog (or anyone else) depends on the ReviewSummaryQuery
// interface for DI, never on this concrete class directly.
@Service
class ReviewSummaryQueryService implements ReviewSummaryQuery {

    private final ReviewRepository reviewRepository;

    ReviewSummaryQueryService(ReviewRepository reviewRepository) {
        this.reviewRepository = reviewRepository;
    }

    @Override
    public ReviewSummaryView getSummary(UUID productId) {
        return reviewRepository.getSummary(productId);
    }
}
