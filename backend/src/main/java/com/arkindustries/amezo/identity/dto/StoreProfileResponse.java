package com.arkindustries.amezo.identity.dto;

import com.arkindustries.amezo.identity.StoreStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * The contract's StoreProfile, field for field
 * (frontend/openapi/fixture.yaml).
 *
 * Everything but id, name, handle, status and updatedAt is nullable there, and
 * is nullable here: a store the seller has not finished filling in says so with
 * a null rather than with an empty string that the storefront would render as a
 * blank line.
 */
public record StoreProfileResponse(
        UUID id,
        String name,
        String handle,
        String tagline,
        String location,
        Integer foundedYear,
        String supportEmail,
        String about,
        String coverUrl,
        String logoUrl,
        StoreStatus status,
        String vacationNote,
        Instant updatedAt
) {
}
