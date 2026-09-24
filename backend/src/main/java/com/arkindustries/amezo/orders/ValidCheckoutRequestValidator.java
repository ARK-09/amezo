package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.dto.CheckoutRequest;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

class ValidCheckoutRequestValidator implements ConstraintValidator<ValidCheckoutRequest, CheckoutRequest> {

    @Override
    public boolean isValid(CheckoutRequest value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }
        return value.sameAsShipping() || value.billingAddress() != null;
    }
}
