package com.arkindustries.amezo.identity.dto;

import com.arkindustries.amezo.identity.IdentityType;

import java.time.Instant;
import java.util.UUID;

/**
 * The body of GET /sessions/current, matching the identity body documented in
 * docs/api-design.md. identityType goes over the wire as the enum name
 * (SELLER/BUYER), the same convention as order status and image status.
 */
public record SessionIdentityResponse(
        IdentityType identityType,
        UUID identityId,
        String email,
        String fullName,
        Instant expiresAt
) {
}
