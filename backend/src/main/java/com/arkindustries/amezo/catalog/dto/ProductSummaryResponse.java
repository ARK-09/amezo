package com.arkindustries.amezo.catalog.dto;

import java.math.BigDecimal;
import java.util.UUID;


/**
 * A search-results card. priceFrom / inStock / thumbnailUrl are aggregates over
 * the product's variants, offers and images rather than columns on product, which
 * is why ProductService batches three lookups per page to build them instead of
 * mapping an entity field by field.
 *
 * defaultVariantId / defaultVariantPrice are what a card's Add-to-cart button
 * puts in the cart. They exist so that button needs no network call at all: the
 * cart is keyed by variant, a summary card had no variant id, and fetching the
 * whole product on click is a round trip a localStorage cart shouldn't wait for.
 * The default is the cheapest in-stock offer (falling back to the cheapest of
 * any) and its own price travels with it, so what lands in the cart is priced
 * exactly as the offer is - not as priceFrom, which can belong to a sold-out
 * variant.
 *
 * avgRating is real now: reviews' query interface takes a batch, so a page of
 * cards costs one aggregate query rather than one per card. Null means no reviews
 * yet, which the card shows as no badge rather than as a zero-star rating.
 *
 * category is the whole {slug, name} pair, not a bare string. The slug is what a
 * filter or a link carries and is stable across renames; the name is what the
 * card prints. Shipping both means no screen has to hold the category list just to
 * turn one into the other.
 *
 * sellerId is here so a card can refuse to add a seller's own product to their
 * cart without a second request. The rule itself is enforced in checkout - this
 * only lets the button say so before the buyer finds out the hard way.
 */
public record ProductSummaryResponse(
        UUID id,
        String slug,
        String title,
        String brandName,
        CategoryResponse category,
        BigDecimal priceFrom,
        String thumbnailUrl,
        boolean inStock,
        UUID defaultVariantId,
        BigDecimal defaultVariantPrice,
        Double avgRating,
        UUID sellerId
) {
}
