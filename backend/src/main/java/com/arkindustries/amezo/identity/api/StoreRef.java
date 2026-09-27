package com.arkindustries.amezo.identity.api;

import java.util.UUID;

/**
 * A storefront as another feature prints it: the contract's StoreRef
 * (frontend/openapi/fixture.yaml) - id, display name, URL handle, nothing else.
 *
 * Deliberately a flat record and not the SellerStore entity. Handing a managed
 * entity across a feature boundary would give the caller lazy associations and a
 * lifecycle it has no business touching - the same reasoning as
 * catalog.api.ProductCatalogSummary, and what PackageBoundaryTest enforces.
 *
 * id is the store row's id, matching StoreProfile.id, and NOT the seller's id: a
 * buyer's order card names a storefront, and the seller's login record is not
 * something a buyer-facing screen should be handed.
 */
public record StoreRef(UUID id, String name, String handle) {
}
