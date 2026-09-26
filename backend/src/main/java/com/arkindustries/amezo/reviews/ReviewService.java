package com.arkindustries.amezo.reviews;

import com.arkindustries.amezo.catalog.api.ProductReferenceResolver;
import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.identity.api.BuyerIdentityLookup;
import com.arkindustries.amezo.identity.api.CurrentBuyer;
import com.arkindustries.amezo.orders.api.OrderLinePurchaseQuery;
import com.arkindustries.amezo.orders.api.PurchasedLine;
import com.arkindustries.amezo.reviews.dto.CreateReviewRequest;
import com.arkindustries.amezo.reviews.dto.ReviewEligibilityResponse;
import com.arkindustries.amezo.reviews.dto.ReviewResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class ReviewService {

    private static final URI ALREADY_REVIEWED = URI.create("https://api/errors/already-reviewed");

    private final ReviewRepository reviewRepository;
    private final ProductReferenceResolver productReferences;
    private final ProductVariantSummaryQuery variantSummaries;
    private final OrderLinePurchaseQuery purchases;
    private final BuyerIdentityLookup buyerIdentities;
    private final CurrentBuyer currentBuyer;

    public ReviewService(
            ReviewRepository reviewRepository,
            ProductReferenceResolver productReferences,
            ProductVariantSummaryQuery variantSummaries,
            OrderLinePurchaseQuery purchases,
            BuyerIdentityLookup buyerIdentities,
            CurrentBuyer currentBuyer) {
        this.reviewRepository = reviewRepository;
        this.productReferences = productReferences;
        this.variantSummaries = variantSummaries;
        this.purchases = purchases;
        this.buyerIdentities = buyerIdentities;
        this.currentBuyer = currentBuyer;
    }

    @Transactional(readOnly = true)
    public Page<ReviewResponse> listForProduct(String productReference, Pageable pageable) {
        UUID productId = requireProductId(productReference);
        // Same native-query-can't-take-a-Sort issue as ProductRepository.search -
        // "sort newest first" is fixed in the query itself, not client-configurable.
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        return reviewRepository.findByProductId(productId, unsorted).map(ReviewMapper::toResponse);
    }

    /**
     * Writing a review, with the purchase check on the server where it belongs.
     *
     * Three things have to hold, and each one fails differently on purpose:
     *   - the line exists (404) - nothing to review;
     *   - the line is the CALLER's (403) - citing somebody else's order number is
     *     the obvious way to fake a purchase, so the buyer on the line's order must
     *     be the buyer in the session;
     *   - the caller hasn't reviewed this product already (409) - the schema's
     *     UNIQUE (buyer_identity_id, product_id) has always said one per product,
     *     so that is the rule, and buying the same thing twice doesn't buy a second
     *     review.
     *
     * The product is taken from the line, never from the request, so a valid line
     * cannot be used to review a different product.
     */
    @Transactional
    public ReviewResponse create(CreateReviewRequest request) {
        UUID buyerIdentityId = currentBuyer.buyerIdentityId();

        PurchasedLine line = purchases.findLine(request.orderLineId())
                .orElseThrow(() -> new NotFoundException("Order line " + request.orderLineId() + " not found"));

        if (!line.buyerIdentityId().equals(buyerIdentityId)) {
            // 403 via Spring Security's own exception, so it is rendered by
            // ProblemDetailAccessDeniedHandler exactly like every other denial.
            // Not 404: pretending the line doesn't exist would be a lie to a caller
            // who is authenticated, and the line's id is not a secret worth
            // protecting with a misleading status.
            throw new AccessDeniedException("That order line belongs to a different buyer");
        }

        reviewRepository.findByBuyerIdentityIdAndProductId(buyerIdentityId, line.productId())
                .ifPresent(existing -> {
                    throw new ConflictException(
                            ALREADY_REVIEWED,
                            "Already reviewed",
                            "You have already reviewed this product",
                            List.of());
                });

        // saveAndFlush, not save: @CreationTimestamp is populated by the INSERT, and
        // a plain save defers that to commit - so the response echoed a review with
        // a null createdAt, which the page then had no date to show.
        Review saved = reviewRepository.saveAndFlush(Review.builder()
                .orderLineId(line.orderLineId())
                .buyerIdentityId(buyerIdentityId)
                .productId(line.productId())
                .rating(request.rating())
                .body(request.body())
                .build());

        return ReviewMapper.toResponse(saved, variantLabel(line), reviewerName(buyerIdentityId));
    }

    /**
     * What the product page asks before it offers a form. Buyer-scoped, so it is
     * its own request rather than a field on the public product response - which is
     * the same for every visitor and wants to stay cacheable.
     */
    @Transactional(readOnly = true)
    public ReviewEligibilityResponse eligibility(String productReference) {
        UUID buyerIdentityId = currentBuyer.buyerIdentityId();
        UUID productId = requireProductId(productReference);

        Optional<Review> existing =
                reviewRepository.findByBuyerIdentityIdAndProductId(buyerIdentityId, productId);
        Optional<PurchasedLine> purchase = purchases.findPurchase(buyerIdentityId, productId);

        if (existing.isPresent()) {
            Review review = existing.get();
            String label = purchase.map(this::variantLabel).orElse(null);
            return new ReviewEligibilityResponse(
                    false,
                    ReviewEligibilityResponse.ALREADY_REVIEWED,
                    null,
                    ReviewMapper.toResponse(review, label, reviewerName(buyerIdentityId)));
        }

        return purchase
                .map(line -> new ReviewEligibilityResponse(true, null, line.orderLineId(), null))
                .orElseGet(() -> new ReviewEligibilityResponse(
                        false, ReviewEligibilityResponse.NOT_PURCHASED, null, null));
    }

    private UUID requireProductId(String productReference) {
        return productReferences.resolveId(productReference)
                .orElseThrow(() -> new NotFoundException("Product '" + productReference + "' not found"));
    }

    private String variantLabel(PurchasedLine line) {
        Map<UUID, String> labels = variantSummaries.variantLabelsByIds(List.of(line.variantId()));
        return labels.get(line.variantId());
    }

    private String reviewerName(UUID buyerIdentityId) {
        return buyerIdentities.findFullName(buyerIdentityId).orElse(null);
    }
}
