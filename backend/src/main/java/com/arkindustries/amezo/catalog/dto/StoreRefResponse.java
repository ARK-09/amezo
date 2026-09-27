package com.arkindustries.amezo.catalog.dto;

import java.util.UUID;

/**
 * The contract's StoreRef, as a product carries it: the store that lists this
 * product, so a card or a detail page can link to the storefront BY HANDLE.
 *
 * brandName is not a substitute and never was. It is a free-text column the seller
 * types per product - two sellers can use the same string, one seller can use a
 * different one on every listing, and it is a display name rather than a key. Until
 * this field existed, "Sold by" linked to /stores/{brandName} and the storefront had
 * to try to resolve a display name back to a handle.
 *
 * {@code id} is the SELLER's id, matching identity.api.StoreRef and PublicStore.id,
 * so the storefront can match its own listings by key - see StoreRef's own note on
 * why that is the id every other feature already holds.
 *
 * A response record of its own rather than serialising identity.api.StoreRef
 * straight out, for the reason orders.dto.StoreRefResponse gives: that is a
 * cross-feature query result and this is a wire shape.
 */
public record StoreRefResponse(UUID id, String name, String handle) {
}
