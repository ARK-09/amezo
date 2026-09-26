package com.arkindustries.amezo.catalog.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * Batched product title / slug / category / thumbnail lookups by id, for
 * features that only hold a product-id snapshot and need current display text
 * without importing catalog's entities directly - see PackageBoundaryTest.
 *
 * The sibling of ProductVariantSummaryQuery, kept separate rather than folded
 * into it: that one answers "what is this line item called", which every order
 * detail asks, while this one also carries the category a report groups by and
 * the image it illustrates with. Merging them would make every order-detail
 * render pay for a category join and an image query it never reads.
 *
 * Map, not List: the caller is matching ids it already holds, and an id with no
 * surviving product is simply absent from the result rather than a null hole in
 * a positional list.
 */
public interface ProductCatalogSummaryQuery {

    Map<UUID, ProductCatalogSummary> summariesByIds(Collection<UUID> productIds);
}
