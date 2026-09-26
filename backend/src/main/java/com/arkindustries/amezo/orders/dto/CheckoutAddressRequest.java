package com.arkindustries.amezo.orders.dto;

import com.arkindustries.amezo.common.reference.ValidCountryCode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * country is an ISO 3166-1 alpha-2 code from GET /countries. @Size keeps the shape
 * and @ValidCountryCode keeps the value honest - the frontend's selector can only
 * offer real codes, and this is what stops a caller who skips it from storing
 * "XX" or the plausible-but-wrong "UK".
 */
public record CheckoutAddressRequest(
        @NotBlank String fullName,
        @NotBlank String line1,
        String line2,
        @NotBlank String city,
        @NotBlank String state,
        @NotBlank String postalCode,
        @NotBlank @Size(min = 2, max = 2) @ValidCountryCode String country
) {
}
