package com.arkindustries.amezo.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * fileSizeBytes is required, not informational: it's signed into the presigned
 * URL as Content-Length (so a PUT of any other size fails the signature) and
 * stored on the image row, which is what makes the storage cap in
 * SellerProductService countable rather than a guess.
 */
public record ImageUploadUrlRequest(
        @NotBlank String contentType,
        @NotNull @Positive Long fileSizeBytes,
        @NotNull @PositiveOrZero Integer position
) {
}
