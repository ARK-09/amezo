package com.arkindustries.marketplace.catalog;

import com.arkindustries.marketplace.catalog.dto.ProductDetailResponse;
import com.arkindustries.marketplace.catalog.dto.ProductSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * GET /products?q= (search) and GET /products/{id} (detail) - the
 * category/price/warranty/stock filters and sort on search, from
 * docs/api-design.md, are still deferred business logic for a later pass.
 * Both are already public under SecurityConfig's GET /products/** rule.
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

    @GetMapping("/{id}")
    public ProductDetailResponse getDetail(@PathVariable UUID id) {
        return productService.getDetail(id);
    }
}
