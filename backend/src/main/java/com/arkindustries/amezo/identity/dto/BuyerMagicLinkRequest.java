package com.arkindustries.amezo.identity.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record BuyerMagicLinkRequest(
        @NotBlank @Email String email
) {
}
