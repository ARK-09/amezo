package com.arkindustries.amezo.catalog.api;

import java.util.UUID;

/**
 * What a product looks like to a feature that only holds its id: the display
 * text, the reference a link is built from, and the category it is filed under.
 *
 * Deliberately a flat record rather than the Product entity. Crossing a feature
 * boundary with an entity would hand the caller a managed object with lazy
 * associations and a lifecycle it has no business touching - see
 * PackageBoundaryTest - and the callers here only ever print these fields.
 *
 * thumbnailUrl is nullable: a product is allowed to have no stored image, and a
 * placeholder would be the caller's decision to make, not this query's.
 */
public record ProductCatalogSummary(
        UUID id,
        String title,
        /** The URL segment product links use in place of the id (Product.slug). */
        String reference,
        String categorySlug,
        String categoryName,
        String thumbnailUrl) {
}
