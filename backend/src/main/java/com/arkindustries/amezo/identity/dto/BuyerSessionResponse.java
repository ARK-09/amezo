package com.arkindustries.amezo.identity.dto;

import java.util.UUID;

public record BuyerSessionResponse(
        UUID buyerIdentityId,
        String email,
        String fullName
) {
}
