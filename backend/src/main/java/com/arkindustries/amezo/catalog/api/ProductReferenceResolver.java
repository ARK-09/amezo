package com.arkindustries.amezo.catalog.api;

import java.util.Optional;
import java.util.UUID;

/**
 * Turns whatever a URL carries for a product - a slug, or a legacy id - into the
 * product's id. Every feature whose routes are nested under /products/{reference}
 * needs this now that the segment is a slug, and none of them may resolve it by
 * touching catalog's repository.
 */
public interface ProductReferenceResolver {

    /**
     * Empty when nothing matches. A segment that parses as a UUID is looked up by
     * id, so links minted before slugs existed still resolve instead of 404ing.
     */
    Optional<UUID> resolveId(String reference);
}
