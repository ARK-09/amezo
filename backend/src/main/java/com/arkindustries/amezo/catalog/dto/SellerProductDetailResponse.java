package com.arkindustries.amezo.catalog.dto;

import java.util.List;
import java.util.UUID;

/**
 * The seller's own view of one product - the read behind the portal's
 * view/edit page. Differs from the public ProductDetailResponse in two ways
 * that matter to whoever is editing: variants carry exact stock and SKU, and
 * images include the PENDING ones, so an upload that never completed is
 * visible instead of silently missing.
 */
public record SellerProductDetailResponse(
        UUID id,
        String title,
        String brandName,
        String description,
        String category,
        List<SellerVariantResponse> variants,
        List<SellerImageResponse> images
) {
    public record SellerImageResponse(UUID id, String url, int position, String status) {
    }
}
