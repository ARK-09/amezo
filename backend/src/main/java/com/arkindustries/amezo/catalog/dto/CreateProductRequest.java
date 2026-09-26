package com.arkindustries.amezo.catalog.dto;

import com.arkindustries.amezo.catalog.ProductStatus;
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
 *
 * status is optional, and null means ACTIVE - both the column default (V17) and
 * what the contract documents. The product form has always sent this field;
 * until V17 there was nothing on this side to receive it.
 */
public record CreateProductRequest(
        @NotBlank String title,
        String brandName,
        String description,
        @NotBlank String categorySlug,
        ProductStatus status,
        @NotEmpty @Valid List<CreateVariantRequest> variants
) {
}
