package com.arkindustries.amezo.catalog.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * price/stockQty flattened from offer per docs/api-design.md - offer stays
 * a separate entity/table, this flattening is purely a mapper concern (see
 * ProductMapper.toDetail). inStock is out-of-stock-still-returned, marked,
 * not filtered: a variant with stockQty 0 is present here with inStock=false.
 */
public record VariantDetailResponse(
        UUID id,
        String label,
        String sku,
        BigDecimal price,
        int stockQty,
        boolean inStock
) {
}
