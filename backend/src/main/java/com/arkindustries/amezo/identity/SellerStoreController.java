package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.dto.StoreProfileResponse;
import com.arkindustries.amezo.identity.dto.UpdateStoreProfileRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The seller's own storefront profile - the contract's getMyStore and
 * updateMyStore (frontend/openapi/fixture.yaml).
 *
 * Under /api/v1 because that is where the contract puts it and where every new
 * route goes; the older unversioned surface is left as it is.
 *
 * No SecurityConfig change was needed and none was made: the existing
 * "/api/v1/sellers/me/**" matcher already scopes this whole namespace to
 * hasRole("SELLER"), which is exactly why that matcher was written as a
 * namespace rather than as a list of methods.
 */
@RestController
@RequestMapping("/api/v1/sellers/me/store")
public class SellerStoreController {

    private final SellerStoreService sellerStoreService;

    SellerStoreController(SellerStoreService sellerStoreService) {
        this.sellerStoreService = sellerStoreService;
    }

    /**
     * Always a profile, never a 404: a seller who has never opened Store
     * Settings gets their default store provisioned here, on the spot. See
     * SellerStoreProvisioner.
     */
    @GetMapping
    public StoreProfileResponse getMine() {
        return sellerStoreService.getMine();
    }

    @PatchMapping
    public StoreProfileResponse update(@Valid @RequestBody UpdateStoreProfileRequest request) {
        return sellerStoreService.updateMine(request);
    }
}
