package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.dto.SellerOrderDetailResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderSummaryResponse;
import com.arkindustries.amezo.orders.dto.ShipOrderRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Auth-gated seller order management - already permitted for hasRole("SELLER") by SecurityConfig's GET/POST /sellers/me/** rules. */
@RestController
@RequestMapping("/sellers/me/orders")
public class SellerOrderController {

    private final SellerOrderService sellerOrderService;

    public SellerOrderController(SellerOrderService sellerOrderService) {
        this.sellerOrderService = sellerOrderService;
    }

    @GetMapping
    public Page<SellerOrderSummaryResponse> listMine(
            @RequestParam(required = false) OrderStatus status, Pageable pageable) {
        return sellerOrderService.listMine(status, pageable);
    }

    @GetMapping("/{id}")
    public SellerOrderDetailResponse getDetail(@PathVariable UUID id) {
        return sellerOrderService.getDetail(id);
    }

    @PostMapping("/{id}/ship")
    public SellerOrderDetailResponse ship(@PathVariable UUID id, @Valid @RequestBody ShipOrderRequest request) {
        return sellerOrderService.ship(id, request.trackingNumber());
    }
}
