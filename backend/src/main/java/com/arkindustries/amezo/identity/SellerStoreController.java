package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.dto.StoreImageConfirmRequest;
import com.arkindustries.amezo.identity.dto.StoreImageUploadUrlRequest;
import com.arkindustries.amezo.identity.dto.StoreImageUploadUrlResponse;
import com.arkindustries.amezo.identity.dto.StoreProfileResponse;
import com.arkindustries.amezo.identity.dto.UpdateStoreProfileRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
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

    /**
     * Step one of the cover/logo upload: reserve a slot and get a presigned PUT
     * for it. 201, because a reservation is a resource the confirm step then
     * names by id.
     */
    @PostMapping("/images")
    @ResponseStatus(HttpStatus.CREATED)
    public StoreImageUploadUrlResponse createImageUploadUrl(
            @Valid @RequestBody StoreImageUploadUrlRequest request) {
        return sellerStoreService.createImageUploadUrl(request);
    }

    /**
     * Step three (step two is the browser's own PUT to the presigned URL):
     * promote the uploaded object onto the live storefront. Answers the whole
     * updated profile so the Branding section does not have to re-read it.
     */
    @PostMapping("/images/confirm")
    public StoreProfileResponse confirmImage(@Valid @RequestBody StoreImageConfirmRequest request) {
        return sellerStoreService.confirmImage(request);
    }
}
