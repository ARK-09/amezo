package com.arkindustries.amezo.identity.api;

import java.util.UUID;

/**
 * A storefront as another feature prints it: the contract's StoreRef - a name to
 * show and a handle to link to, and nothing else.
 *
 * Deliberately a flat record and not the SellerStore entity. Handing a managed
 * entity across a feature boundary would give the caller lazy associations and a
 * lifecycle it has no business touching - the same reasoning as
 * catalog.api.ProductCatalogSummary, and what PackageBoundaryTest enforces.
 *
 * {@code id} is the SELLER's id, not the seller_store row's. Two features built
 * this record independently and disagreed about that - orders passed the store
 * row's id, refunds passed the seller's - which is the kind of thing that only
 * hurts once someone starts joining on it. The seller's id wins because it is
 * the id every other feature already holds (order_line.seller_id_snapshot,
 * refund_request.seller_id) and therefore the only one a caller can do anything
 * with; the store row's id appears nowhere outside identity. Note this is NOT
 * the same id as StoreProfile.id, which is the store row and belongs to the
 * seller's own settings screen.
 *
 * The contract makes id optional and nothing on the client reads it today, so
 * this is a correctness choice made before it can bite rather than a fix.
 */
public record StoreRef(UUID id, String name, String handle) {
}
