package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderLineResponse(
        UUID id,
        String productTitle,
        String variantLabel,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal
) {
}
