package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.VariantOfferResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * GET /variants?ids=a,b,c - the cart's batch lookup. Public, like the rest of the
 * catalog read surface: a cart exists before anyone signs in.
 *
 * Ids are comma-separated in one parameter rather than repeated (?ids=a&ids=b)
 * because that's the contract the frontend was built against
 * (frontend/openapi/fixture.yaml).
 */
@RestController
@RequestMapping("/variants")
public class VariantController {

    private final ProductService productService;

    public VariantController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public List<VariantOfferResponse> getByIds(@RequestParam String ids) {
        return productService.getVariantOffers(parseIds(ids));
    }

    /**
     * Unparseable ids are dropped rather than 400'd, for the same reason unknown
     * ids are: this list comes from the browser's own stored cart, which can hold
     * anything a previous version of the app (or a hand-edited localStorage) put
     * there. A stale cart should lose the line it can't resolve, not fail the
     * whole drawer.
     */
    private static List<UUID> parseIds(String ids) {
        return List.of(ids.split(",")).stream()
                .map(String::trim)
                .filter(id -> !id.isEmpty())
                .map(id -> {
                    try {
                        return UUID.fromString(id);
                    } catch (IllegalArgumentException ex) {
                        return null;
                    }
                })
                .filter(id -> id != null)
                .distinct()
                .toList();
    }
}
