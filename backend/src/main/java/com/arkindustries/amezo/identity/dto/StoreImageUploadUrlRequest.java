package com.arkindustries.amezo.identity.dto;

import com.arkindustries.amezo.identity.StoreImageSlot;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

/**
 * The body of POST /api/v1/sellers/me/store/images.
 *
 * fileSizeBytes is required, not informational - exactly as
 * ImageUploadUrlRequest documents for products. It is signed into the presigned
 * URL as Content-Length, so a PUT of any other size fails the signature rather
 * than quietly costing storage, and it is the number the 5 MB per-file cap is
 * checked against before any URL is handed out.
 */
public record StoreImageUploadUrlRequest(
        @NotNull StoreImageSlot slot,

        /**
         * Narrowed to image/* rather than taken as any string. The drop-zone's
         * own hint says "JPG or PNG" and the file input's accept attribute says
         * image/*, so the browser rejects most of this first - but accept only
         * filters the picker, never a drag-and-drop, and the content type is
         * signed into the URL and served back to every shopper as the object's
         * Content-Type. A PDF presented as a storefront cover is a broken image
         * on the public page.
         */
        @NotBlank
        @Pattern(regexp = "image/[A-Za-z0-9.+-]+", message = "must be an image content type")
        String contentType,

        @NotNull @Positive Long fileSizeBytes
) {
}
