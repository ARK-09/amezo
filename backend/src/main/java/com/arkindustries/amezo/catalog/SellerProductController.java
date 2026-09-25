package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.CreateProductRequest;
import com.arkindustries.amezo.catalog.dto.CreateProductResponse;
import com.arkindustries.amezo.catalog.dto.ImageConfirmRequest;
import com.arkindustries.amezo.catalog.dto.ImageResponse;
import com.arkindustries.amezo.catalog.dto.ImageUploadUrlRequest;
import com.arkindustries.amezo.catalog.dto.ImageUploadUrlResponse;
import com.arkindustries.amezo.catalog.dto.CreateVariantRequest;
import com.arkindustries.amezo.catalog.dto.SellerProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.SellerProductSummaryResponse;
import com.arkindustries.amezo.catalog.dto.SellerVariantResponse;
import com.arkindustries.amezo.catalog.dto.UpdateProductRequest;
import com.arkindustries.amezo.catalog.dto.UpdateVariantRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Auth-gated seller product management - list/create/delete + the image
 * upload pair. No edit endpoint, matching the time-boxed scope this was
 * built under (add and delete only). All routes already permitted for
 * hasRole("SELLER") by SecurityConfig.
 */
@RestController
public class SellerProductController {

    private final SellerProductService sellerProductService;

    public SellerProductController(SellerProductService sellerProductService) {
        this.sellerProductService = sellerProductService;
    }

    // Read-then-write for one product, the pair behind the portal's view/edit
    // page. The read sits under /sellers/me/ with the seller's own collection;
    // the writes are keyed by product id under /products/, alongside DELETE
    // /products/{id} - the shape docs/api-design.md set out and the contract in
    // frontend/openapi/fixture.yaml matches.
    @GetMapping("/sellers/me/products/{id}")
    public SellerProductDetailResponse getMine(@PathVariable UUID id) {
        return sellerProductService.getMine(id);
    }

    @PatchMapping("/products/{id}")
    public SellerProductDetailResponse update(
            @PathVariable UUID id, @Valid @RequestBody UpdateProductRequest request) {
        return sellerProductService.update(id, request);
    }

    @PostMapping("/products/{id}/variants")
    public ResponseEntity<SellerVariantResponse> addVariant(
            @PathVariable UUID id, @Valid @RequestBody CreateVariantRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(sellerProductService.addVariant(id, request));
    }

    @DeleteMapping("/variants/{variantId}")
    public ResponseEntity<Void> deleteVariant(@PathVariable UUID variantId) {
        sellerProductService.deleteVariant(variantId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/images/{imageId}")
    public ResponseEntity<Void> deleteImage(@PathVariable UUID imageId) {
        sellerProductService.deleteImage(imageId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/variants/{variantId}")
    public SellerVariantResponse updateVariant(
            @PathVariable UUID variantId, @Valid @RequestBody UpdateVariantRequest request) {
        return sellerProductService.updateVariant(variantId, request);
    }

    @GetMapping("/sellers/me/products")
    public Page<SellerProductSummaryResponse> listMine(Pageable pageable) {
        return sellerProductService.listMine(pageable);
    }

    // Create lives under /sellers/me/, not /products, matching
    // frontend/openapi/fixture.yaml - the contract both sides are generated
    // against. It was /products here, which no security rule covered, so every
    // create fell through to anyRequest().denyAll() and 403'd.
    @PostMapping("/sellers/me/products")
    public ResponseEntity<CreateProductResponse> create(@Valid @RequestBody CreateProductRequest request) {
        CreateProductResponse response = sellerProductService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @DeleteMapping("/products/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        sellerProductService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/products/{id}/images/upload-url")
    public ResponseEntity<ImageUploadUrlResponse> createUploadUrl(
            @PathVariable UUID id, @Valid @RequestBody ImageUploadUrlRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(sellerProductService.createUploadUrl(id, request));
    }

    @PostMapping("/products/{id}/images/confirm")
    public ImageResponse confirmImage(@PathVariable UUID id, @Valid @RequestBody ImageConfirmRequest request) {
        return sellerProductService.confirmImage(id, request);
    }
}
