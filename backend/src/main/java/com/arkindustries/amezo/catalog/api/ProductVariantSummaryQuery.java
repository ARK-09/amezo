package com.arkindustries.amezo.catalog.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * Batched product-title / variant-label lookups by id, for features that
 * only hold a snapshot id (e.g. orders' historical line-item snapshots)
 * and need current display text without importing catalog's entities
 * directly - see PackageBoundaryTest.
 */
public interface ProductVariantSummaryQuery {

    Map<UUID, String> productTitlesByIds(Collection<UUID> productIds);

    Map<UUID, String> variantLabelsByIds(Collection<UUID> variantIds);
}
