package com.arkindustries.amezo.catalog.dto;

import com.arkindustries.amezo.catalog.ProductStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The seller's own view of one product - the read behind the portal's
 * view/edit page. Differs from the public ProductDetailResponse in two ways
 * that matter to whoever is editing: variants carry exact stock and SKU, and
 * images include the PENDING ones, so an upload that never completed is
 * visible instead of silently missing.
 *
 * createdAt/updatedAt are here for the drawer's meta footer ("Created ... /
 * Last updated ..."), which is the only place in the portal that shows them.
 */
public record SellerProductDetailResponse(
        UUID id,
        String slug,
        String title,
        String brandName,
        String description,
        CategoryResponse category,
        ProductStatus status,
        List<SellerVariantResponse> variants,
        List<SellerImageResponse> images,
        Instant createdAt,
        Instant updatedAt
) {
    public record SellerImageResponse(UUID id, String url, int position, String status) {
    }
}
