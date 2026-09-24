package com.arkindustries.amezo.catalog.dto;

import java.time.Instant;
import java.util.UUID;

public record ImageUploadUrlResponse(
        UUID id,
        String status,
        String uploadUrl,
        Instant expiresAt
) {
}
