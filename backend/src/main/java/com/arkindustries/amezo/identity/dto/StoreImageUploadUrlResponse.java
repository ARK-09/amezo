package com.arkindustries.amezo.identity.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * The 201 from POST /api/v1/sellers/me/store/images: exactly the three fields
 * the contract marks required. `id` is what the confirm step quotes, `uploadUrl`
 * is PUT to directly by the browser, and `expiresAt` is how long that is true
 * for.
 */
public record StoreImageUploadUrlResponse(
        UUID id,
        String uploadUrl,
        Instant expiresAt
) {
}
