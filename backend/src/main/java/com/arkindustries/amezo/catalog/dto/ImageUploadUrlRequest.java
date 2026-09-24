package com.arkindustries.amezo.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record ImageUploadUrlRequest(
        @NotBlank String contentType,
        Long fileSizeBytes,
        @NotNull @PositiveOrZero Integer position
) {
}
