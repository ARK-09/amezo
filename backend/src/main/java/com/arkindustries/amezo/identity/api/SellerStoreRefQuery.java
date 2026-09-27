package com.arkindustries.amezo.identity.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * Batched "which storefront is this?" lookups, for features that hold a seller
 * id snapshot and need a name and handle to print it - a buyer's order card
 * being the first of them.
 *
 * Batched for the same reason every other cross-feature lookup here is: a
 * buyer's page of ten orders from ten different sellers costs one query, not
 * ten.
 *
 * Map, not List: the caller is matching ids it already holds. A seller id with
 * no surviving seller row is simply absent from the result rather than a null
 * hole in a positional list.
 */
public interface SellerStoreRefQuery {

    Map<UUID, StoreRef> storeRefsBySellerIds(Collection<UUID> sellerIds);
}
