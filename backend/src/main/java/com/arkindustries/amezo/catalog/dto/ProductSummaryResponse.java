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
 * avgRating is in the frontend's contract (optional there) but not returned yet:
 * it needs a per-product review aggregate, and reviews' query interface answers
 * one product at a time - a page of 16 cards would be 16 extra queries. Deferred
 * until that interface takes a batch.
 */
public record ProductSummaryResponse(
        UUID id,
        String title,
        String brandName,
        String category,
        BigDecimal priceFrom,
        String thumbnailUrl,
        boolean inStock,
        UUID defaultVariantId,
        BigDecimal defaultVariantPrice
) {
}
