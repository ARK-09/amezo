package com.arkindustries.amezo.common.reference;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.ANNOTATION_TYPE;
import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.ElementType.RECORD_COMPONENT;

/**
 * Rejects anything that isn't a country in CountryCatalog. This is the server-side
 * half of "the country must come from the system list": a client that skips the
 * selector and posts "XX", or a plausible-looking "UK" (the ISO code is GB), gets a
 * 422 naming the field.
 *
 * Null passes, so the field's own @NotBlank owns the "missing" case and a blank
 * submission produces one message instead of two.
 */
@Documented
@Constraint(validatedBy = ValidCountryCodeValidator.class)
@Target({FIELD, PARAMETER, ANNOTATION_TYPE, RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidCountryCode {

    String message() default "must be a valid ISO 3166-1 alpha-2 country code";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
