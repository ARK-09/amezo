package com.arkindustries.amezo.catalog.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A search-results card. priceFrom / inStock / thumbnailUrl are aggregates over
 * the product's variants, offers and images rather than columns on product, which
 * is why ProductService batches three lookups per page to build them instead of
 * mapping an entity field by field.
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
        boolean inStock
) {
}
