package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.dto.LastCheckoutDetailsResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Buyer-only, unlike POST /orders next door, which is public so that guests can
 * check out. The difference is the point: placing an order needs no account, but
 * reading back what someone ordered before is reading their data, so it needs to
 * be them asking.
 */
@RestController
@RequestMapping("/checkout")
public class CheckoutDetailsController {

    private final LastCheckoutDetailsService lastCheckoutDetailsService;

    public CheckoutDetailsController(LastCheckoutDetailsService lastCheckoutDetailsService) {
        this.lastCheckoutDetailsService = lastCheckoutDetailsService;
    }

    /** 200 with the details, or 204 for a buyer who has not ordered before. */
    @GetMapping("/last-details")
    public ResponseEntity<LastCheckoutDetailsResponse> lastDetails() {
        return lastCheckoutDetailsService.lastDetails()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
