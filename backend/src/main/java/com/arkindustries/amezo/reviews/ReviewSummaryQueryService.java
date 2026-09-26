package com.arkindustries.amezo.reviews;

import com.arkindustries.amezo.reviews.api.ProductReviewSummaryView;
import com.arkindustries.amezo.reviews.api.ReviewSummaryQuery;
import com.arkindustries.amezo.reviews.api.ReviewSummaryView;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

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

    @Override
    public Map<UUID, ReviewSummaryView> getSummaries(Collection<UUID> productIds) {
        if (productIds.isEmpty()) {
            // IN () is a syntax error in some dialects and a full scan in others;
            // either way there is nothing to ask.
            return Map.of();
        }
        return reviewRepository.getSummaries(productIds).stream()
                .collect(Collectors.toMap(
                        ProductReviewSummaryView::productId,
                        view -> new ReviewSummaryView(view.averageRating(), view.count())));
    }
}
