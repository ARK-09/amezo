package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record OrderResponse(
        UUID id,
        Instant placedAt,
        List<OrderLineResponse> lines,
        BigDecimal total
) {
}
