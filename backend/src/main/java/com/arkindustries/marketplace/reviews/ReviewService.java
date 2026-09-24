package com.arkindustries.marketplace.reviews;

import com.arkindustries.marketplace.catalog.api.ProductExistenceQuery;
import com.arkindustries.marketplace.common.exception.NotFoundException;
import com.arkindustries.marketplace.reviews.dto.ReviewResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final ProductExistenceQuery productExistenceQuery;

    public ReviewService(ReviewRepository reviewRepository, ProductExistenceQuery productExistenceQuery) {
        this.reviewRepository = reviewRepository;
        this.productExistenceQuery = productExistenceQuery;
    }

    public Page<ReviewResponse> listForProduct(UUID productId, Pageable pageable) {
        if (!productExistenceQuery.exists(productId)) {
            throw new NotFoundException("Product " + productId + " not found");
        }
        // Same native-query-can't-take-a-Sort issue as ProductRepository.search -
        // "sort newest first" is fixed in the query itself, not client-configurable.
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        return reviewRepository.findByProductId(productId, unsorted).map(ReviewMapper::toResponse);
    }
}
