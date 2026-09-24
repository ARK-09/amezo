package com.arkindustries.marketplace.reviews;

import com.arkindustries.marketplace.reviews.dto.ReviewResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Lives in the reviews feature package even though its path is nested
// under /products - the URL is a routing concern, not a package one.
// Already public under SecurityConfig's GET /products/** rule.
@RestController
@RequestMapping("/products/{productId}/reviews")
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping
    public Page<ReviewResponse> list(@PathVariable UUID productId, Pageable pageable) {
        return reviewService.listForProduct(productId, pageable);
    }
}
