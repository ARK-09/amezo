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

    /**
     * The seller-facing stock code, for the order drawer's line rows ("Black, 40mm
     * · AUR-ONE-BLK"). Its own map rather than a field on the label: the label is
     * what a buyer reads and is always present, while an sku is optional on a
     * variant and only the seller's screens print it.
     *
     * A variant with no sku is ABSENT from the result rather than mapped to null -
     * Map.of and Collectors.toMap both reject a null value, and absent is what every
     * other query here means by "nothing to show".
     */
    Map<UUID, String> variantSkusByIds(Collection<UUID> variantIds);
}
