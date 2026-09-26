package com.arkindustries.amezo.identity.dto;

import jakarta.validation.constraints.NotBlank;

public record BuyerVerifyRequest(
        @NotBlank String token
) {
}
