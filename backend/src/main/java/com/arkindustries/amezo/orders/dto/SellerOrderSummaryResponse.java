package com.arkindustries.amezo.orders.dto;

import com.arkindustries.amezo.orders.OrderStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record SellerOrderSummaryResponse(
        UUID id,
        String buyerEmail,
        Instant placedAt,
        BigDecimal total,
        OrderStatus status
) {
}
