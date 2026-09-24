package com.arkindustries.amezo.orders.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CheckoutAddressRequest(
        @NotBlank String fullName,
        @NotBlank String line1,
        String line2,
        @NotBlank String city,
        @NotBlank String state,
        @NotBlank String postalCode,
        @NotBlank @Size(min = 2, max = 2) String country
) {
}
