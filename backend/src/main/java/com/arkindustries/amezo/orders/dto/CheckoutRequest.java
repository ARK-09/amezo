package com.arkindustries.amezo.orders.dto;

import com.arkindustries.amezo.orders.ValidCheckoutRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * sameAsShipping, not billingSameAsShipping - matches this task's field
 * naming, not the earlier API design doc's (flagged as a naming
 * difference, not fixed silently in one direction or the other).
 */
@ValidCheckoutRequest
public record CheckoutRequest(
        @NotBlank @Email String email,
        @NotBlank String phone,
        @NotNull @Valid CheckoutAddressRequest shippingAddress,
        boolean sameAsShipping,
        @Valid CheckoutAddressRequest billingAddress,
        @NotEmpty List<@Valid CheckoutLineRequest> lines
) {
}
