package com.arkindustries.amezo.catalog.dto;

import java.util.UUID;

/**
 * The single variant a low-stock row is about - the contract's
 * LowestStockVariant.
 *
 * Not a plain "sku" field on SellerProductRowResponse, because there is no such
 * thing as a product's SKU here: sku is a column on variant, so a product with
 * three variants has three SKUs. A bare sku on the product row would be null for
 * most products and would misdescribe the ones where it happened to be set.
 *
 * It names the LEAST-stocked variant because that is what the seller dashboard's
 * Low stock widget is for. "Restock this product" is not actionable when four of
 * its five variants are fine - the seller needs the one line to reorder.
 *
 * Carries stockQty as well as the label and sku so the client can show the
 * number for the variant it names, rather than having to pair it with the row's
 * totalStock, which is a different figure (the sum over every variant).
 */
public record LowestStockVariantResponse(
        UUID id,
        String label,
        String sku,
        int stockQty
) {
}
