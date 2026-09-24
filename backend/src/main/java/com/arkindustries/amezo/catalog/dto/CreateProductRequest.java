package com.arkindustries.amezo.catalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record CreateProductRequest(
        @NotBlank String title,
        String brandName,
        String description,
        @NotBlank String category,
        @NotEmpty @Valid List<CreateVariantRequest> variants
) {
}
