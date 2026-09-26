package com.arkindustries.amezo.orders.dto;

/**
 * An address on the way out. Mirrors CheckoutAddressRequest field for field so the
 * checkout form can prefill straight from it, with country the same ISO 3166-1
 * alpha-2 code the selector and @ValidCountryCode both speak.
 */
public record AddressResponse(
        String fullName,
        String line1,
        String line2,
        String city,
        String state,
        String postalCode,
        String country
) {
}
