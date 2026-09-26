package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.dto.CategoryShareResponse;
import com.arkindustries.amezo.orders.dto.SellerMetricsResponse;
import com.arkindustries.amezo.orders.dto.TopProductResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * The seller dashboard's three reads.
 *
 * Under /api/v1, which the rest of this application is not: the existing routes
 * (/products, /sellers/me/products, /sessions/current) are unprefixed and stay
 * that way, because moving them would break the buyer app. These three are new,
 * the contract in frontend/openapi/fixture.yaml puts them under /api/v1, and
 * they are built to match it. Two prefixes coexisting is the accepted interim
 * state, not an oversight.
 *
 * That prefix also means SecurityConfig's blanket "/sellers/me/**" rule does NOT
 * cover them - it matches on the path as written, and anyRequest().denyAll()
 * answers everything it misses. There is a matching "/api/v1/sellers/me/**"
 * rule beside it for exactly this reason.
 *
 * from and to are inclusive calendar dates; the seller they describe is always
 * the caller (CurrentSeller), never a path parameter, so there is no cross-seller
 * request to reject in the first place.
 */
@RestController
@RequestMapping("/api/v1/sellers/me/metrics")
public class SellerMetricsController {

    private final SellerMetricsService sellerMetricsService;

    public SellerMetricsController(SellerMetricsService sellerMetricsService) {
        this.sellerMetricsService = sellerMetricsService;
    }

    @GetMapping
    public SellerMetricsResponse metrics(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "day") String interval) {
        return sellerMetricsService.metrics(from, to, interval);
    }

    @GetMapping("/top-products")
    public List<TopProductResponse> topProducts(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Integer limit) {
        return sellerMetricsService.topProducts(from, to, limit);
    }

    @GetMapping("/category-breakdown")
    public List<CategoryShareResponse> categoryBreakdown(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return sellerMetricsService.categoryBreakdown(from, to);
    }
}
