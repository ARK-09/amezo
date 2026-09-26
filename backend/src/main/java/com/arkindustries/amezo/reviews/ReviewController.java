package com.arkindustries.amezo.reviews;

import com.arkindustries.amezo.reviews.dto.CreateReviewRequest;
import com.arkindustries.amezo.reviews.dto.ReviewEligibilityResponse;
import com.arkindustries.amezo.reviews.dto.ReviewResponse;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lives in the reviews feature package even though its paths are nested under
 * /products - the URL is a routing concern, not a package one.
 *
 * {productRef} is a slug (or a legacy id, which still resolves - see
 * ProductReferenceResolver). Reading is public under SecurityConfig's
 * GET /products/** rule; eligibility is buyer-only, because it answers a question
 * about the caller.
 */
@RestController
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping("/products/{productRef}/reviews")
    public Page<ReviewResponse> list(@PathVariable String productRef, Pageable pageable) {
        return reviewService.listForProduct(productRef, pageable);
    }

    @GetMapping("/products/{productRef}/reviews/eligibility")
    public ReviewEligibilityResponse eligibility(@PathVariable String productRef) {
        return reviewService.eligibility(productRef);
    }

    /**
     * Not nested under the product: the review names the order line it is about,
     * and the server derives the product from it. A product in the path would be a
     * second, contradictable source for the same fact.
     */
    @PostMapping("/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewResponse create(@Valid @RequestBody CreateReviewRequest request) {
        return reviewService.create(request);
    }
}
