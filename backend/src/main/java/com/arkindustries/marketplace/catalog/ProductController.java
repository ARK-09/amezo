package com.arkindustries.marketplace.catalog;

import com.arkindustries.marketplace.catalog.dto.ProductSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Only GET /products?q= is built here - the scaffold's one proving
 * endpoint, chosen specifically because it exercises the full stack
 * (controller -> service -> repository -> native FTS query -> DTO) and
 * the FTS mechanism itself in one shot. category/price/warranty/stock
 * filters and sort, from docs/api-design.md, are business logic for a
 * later pass.
 */
@RestController
@RequestMapping("/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public Page<ProductSummaryResponse> search(
            @RequestParam(required = false) String q,
            Pageable pageable) {
        return productService.search(q, pageable);
    }
}
