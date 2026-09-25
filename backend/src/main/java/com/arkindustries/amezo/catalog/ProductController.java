package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.ProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.ProductSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * GET /products (search + filters) and GET /products/{id} (detail), both public
 * under SecurityConfig's GET /products/** rule. Warranty filtering is still
 * deferred - it belongs to the offer-level warranty model in docs/next-build.md,
 * which isn't built.
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
            @RequestParam(required = false) String category,
            @RequestParam(required = false) BigDecimal priceMin,
            @RequestParam(required = false) BigDecimal priceMax,
            @RequestParam(required = false, defaultValue = "false") boolean inStockOnly,
            // Not an enum parameter: an unrecognised value falls through the
            // ORDER BY's CASE arms to the created_at tiebreak, so a stale
            // bookmarked URL sorts oddly instead of 400ing at the buyer.
            @RequestParam(required = false, defaultValue = "relevance") String sort,
            Pageable pageable) {
        return productService.search(q, category, priceMin, priceMax, inStockOnly, sort, pageable);
    }

    @GetMapping("/{id}")
    public ProductDetailResponse getDetail(@PathVariable UUID id) {
        return productService.getDetail(id);
    }
}
