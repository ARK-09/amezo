package com.arkindustries.amezo.catalog.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

public interface OfferCheckoutQuery {

    /** Keyed by variantId. Variant ids with no matching offer are simply absent from the map. */
    Map<UUID, OfferSnapshot> findByVariantIds(Collection<UUID> variantIds);
}
