package com.arkindustries.amezo.identity.dto;

import jakarta.validation.constraints.NotBlank;

public record SellerVerifyRequest(
        @NotBlank String token
) {
}
