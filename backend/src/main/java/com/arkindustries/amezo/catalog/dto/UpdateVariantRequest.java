package com.arkindustries.amezo.catalog.dto;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

/**
 * Flattened across the two tables the way the create request is: label and sku
 * belong to the variant, price and stockQty to its offer. Same PATCH rule as
 * UpdateProductRequest - null means untouched, and the constraints below all
 * pass on null.
 */
public record UpdateVariantRequest(
        @jakarta.validation.constraints.Pattern(regexp = ".*\\S.*", message = "must not be blank") String label,
        @jakarta.validation.constraints.Pattern(regexp = ".*\\S.*", message = "must not be blank") String sku,
        @Positive BigDecimal price,
        @PositiveOrZero Integer stockQty
) {
}
