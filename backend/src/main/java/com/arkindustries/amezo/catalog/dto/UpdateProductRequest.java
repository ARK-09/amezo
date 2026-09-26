package com.arkindustries.amezo.catalog.dto;

import jakarta.validation.constraints.Pattern;

/**
 * PATCH semantics: a null field is one the seller didn't touch, and stays as it
 * is. The @Pattern allows null and rejects blank, so "don't change the title"
 * and "set the title to spaces" are different requests.
 *
 * The cost of null-means-unchanged is that this shape can't clear brandName or
 * description back to empty. Nothing in the portal offers that yet; when it
 * does, those two need a wrapper that distinguishes absent from explicit null.
 */
public record UpdateProductRequest(
        @Pattern(regexp = ".*\\S.*", message = "must not be blank") String title,
        String brandName,
        String description,
        /**
         * A live category's slug, or null to leave the category alone. Editing the
         * title does NOT move the product's slug: see Product.slug on why an
         * existing URL is worth more than a tidy one.
         */
        @Pattern(regexp = ".*\\S.*", message = "must not be blank") String categorySlug
) {
}
