package com.arkindustries.amezo.orders.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * variantId, not offerId - the frontend cart (CartContext, /variants) has
 * never tracked an offerId anywhere, offer being resolved server-side
 * instead. expectedUnitPrice is optional and isn't in the original ask -
 * without it there's no way to detect price drift at all; the frontend
 * already has this value as priceWhenAdded on each cart line.
 */
public record CheckoutLineRequest(
        @NotNull UUID variantId,
        @NotNull @Min(1) Integer quantity,
        BigDecimal expectedUnitPrice
) {
}
