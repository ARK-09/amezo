package com.arkindustries.amezo.identity.dto;

import java.util.UUID;

public record SellerSessionResponse(
        UUID sellerId,
        String email
) {
}
