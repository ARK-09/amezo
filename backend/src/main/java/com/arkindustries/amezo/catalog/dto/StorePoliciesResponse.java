package com.arkindustries.amezo.catalog.dto;

/**
 * The contract's StorePolicies - seller-authored copy the storefront prints, and the
 * source of the Delivery and Returns lines on a product page.
 *
 * <h2>Every field is null today, and that is not an oversight</h2>
 *
 * seller_store (V18) has no policy columns and the Store Settings design has no fields
 * to author them with, so nothing in this system has ever held a seller's shipping or
 * returns copy. The contract's own note says a null field is "simply not shown rather
 * than rendered as a promise the seller never made", and that is exactly what the
 * storefront and ProductFacts do with it.
 *
 * The object is still returned rather than omitted so that a client reading
 * {@code policies?.shipping} gets a defined shape, and so the four columns plus the
 * four Store Settings fields are the only thing missing when somebody designs them.
 */
public record StorePoliciesResponse(
        String shipping,
        String returns,
        String warranty,
        String shipsFrom) {

    static final StorePoliciesResponse NONE_AUTHORED = new StorePoliciesResponse(null, null, null, null);
}
