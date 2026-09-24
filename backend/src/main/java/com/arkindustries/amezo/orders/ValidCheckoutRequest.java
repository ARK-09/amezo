package com.arkindustries.amezo.orders;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = ValidCheckoutRequestValidator.class)
public @interface ValidCheckoutRequest {

    String message() default "billingAddress is required when sameAsShipping is false";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
