package com.arkindustries.amezo.common.reference;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

class ValidCountryCodeValidator implements ConstraintValidator<ValidCountryCode, String> {

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        // Blank passes as well as null. The javadoc on @ValidCountryCode promises
        // that @NotBlank owns the missing case so a blank submission produces one
        // message, but JSON sends an omitted field as "" rather than null, so
        // only null was being let through and a blank country was reported twice.
        return value == null || value.isBlank() || CountryCatalog.isValidCode(value);
    }
}
