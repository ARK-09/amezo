package com.arkindustries.amezo.orders.dto;

import com.arkindustries.amezo.common.reference.ValidCountryCode;
import jakarta.validation.constraints.NotBlank;

/**
 * country is an ISO 3166-1 alpha-2 code from GET /countries. @ValidCountryCode
 * keeps the value honest - the frontend's selector can only offer real codes, and
 * this is what stops a caller who skips it from storing "XX" or the
 * plausible-but-wrong "UK".
 *
 * No @Size beside it: every code in the catalogue is two characters, so @Size
 * rejected nothing @ValidCountryCode did not already reject and its only effect
 * was a second message under one input. @NotBlank owns presence, this owns the
 * value, and a bad country is reported once.
 */
public record CheckoutAddressRequest(
        @NotBlank String fullName,
        @NotBlank String line1,
        String line2,
        @NotBlank String city,
        @NotBlank String state,
        @NotBlank String postalCode,
        @NotBlank @ValidCountryCode String country
) {
}
