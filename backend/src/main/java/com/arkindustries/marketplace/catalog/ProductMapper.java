package com.arkindustries.marketplace.catalog;

import com.arkindustries.marketplace.catalog.dto.ProductSummaryResponse;

// Package-private: only ProductService uses this. Nothing outside catalog
// should ever need to map a Product entity itself.
class ProductMapper {

    static ProductSummaryResponse toSummary(Product product) {
        return new ProductSummaryResponse(
                product.getId(),
                product.getTitle(),
                product.getBrandName(),
                product.getCategory()
        );
    }
}
