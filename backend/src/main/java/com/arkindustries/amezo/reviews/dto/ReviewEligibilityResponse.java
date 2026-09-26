package com.arkindustries.amezo.reviews.dto;

import java.util.UUID;

/**
 * What the product page asks before offering a review form, so the buyer is told
 * why they can't review rather than being handed a form that 403s on submit.
 *
 * eligible is the only field a client has to read. reason is for the message:
 * NOT_PURCHASED means buy it first, ALREADY_REVIEWED means one per product is the
 * rule. orderLineId is the purchase to submit against, present exactly when
 * eligible is true. existingReview lets the page show what they already said.
 *
 * This is a buyer-scoped read, which is why it is not folded into the public
 * product detail response: that one is the same for everybody and cacheable.
 */
public record ReviewEligibilityResponse(
        boolean eligible,
        String reason,
        UUID orderLineId,
        ReviewResponse existingReview
) {
    public static final String NOT_PURCHASED = "NOT_PURCHASED";
    public static final String ALREADY_REVIEWED = "ALREADY_REVIEWED";
}
