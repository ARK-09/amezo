package com.arkindustries.amezo.catalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

/**
 * categorySlug, not a category name: the client sends what it got from
 * GET /categories, and SellerProductService resolves it through
 * CategoryService.requireSelectable, which refuses anything that isn't a live
 * system category. @NotBlank only catches an empty field - the existence check is
 * the one that matters, and it cannot live in an annotation.
 */
public record CreateProductRequest(
        @NotBlank String title,
        String brandName,
        String description,
        @NotBlank String categorySlug,
        @NotEmpty @Valid List<CreateVariantRequest> variants
) {
}
