package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.CreateProductRequest;
import com.arkindustries.amezo.catalog.dto.CreateProductResponse;
import com.arkindustries.amezo.catalog.dto.ImageConfirmRequest;
import com.arkindustries.amezo.catalog.dto.ImageResponse;
import com.arkindustries.amezo.catalog.dto.ImageUploadUrlRequest;
import com.arkindustries.amezo.catalog.dto.ImageUploadUrlResponse;
import com.arkindustries.amezo.catalog.dto.CreateVariantRequest;
import com.arkindustries.amezo.catalog.dto.ProductOpenOrdersResponse;
import com.arkindustries.amezo.catalog.dto.ReorderImagesRequest;
import com.arkindustries.amezo.catalog.dto.SellerProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.SellerProductRowPageResponse;
import com.arkindustries.amezo.catalog.dto.SellerProductSummaryResponse;
import com.arkindustries.amezo.catalog.dto.SellerVariantResponse;
import com.arkindustries.amezo.catalog.dto.UpdateProductRequest;
import com.arkindustries.amezo.catalog.dto.UpdateVariantRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Auth-gated seller product management - list/create/update/delete, variants,
 * and the image upload pair.
 *
 * Two path prefixes live here. The unversioned routes are the ones the buyer
 * app and the portal already call and are left exactly as they were; the
 * /api/v1 ones are new surface from frontend/openapi/fixture.yaml. Both are
 * served by the same SellerProductService - the version is where a route
 * answers, not a second copy of the feature.
 *
 * SecurityConfig permits all of these for hasRole("SELLER"). The /api/v1 ones
 * needed saying explicitly: /sellers/me/** does not match /api/v1/sellers/me/**,
 * so without their own matchers they fall through to anyRequest().denyAll().
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

    /**
     * The products screen's own read - the contract's sellerListProductsV1.
     *
     * Under /api/v1 because that is where the contract puts it and where all new
     * routes go; the unversioned listMine above is untouched and still serves its
     * existing callers. Same controller, same service: this is one more route
     * onto the seller's catalogue, not a second implementation of it.
     */
    @GetMapping("/api/v1/sellers/me/products")
    public SellerProductRowPageResponse listRows(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) ProductStatus status,
            @RequestParam(required = false) String categorySlug,
            @RequestParam(required = false) Integer stockBelow,
            @RequestParam(required = false) String sort,
            // Defaults spelled out because the contract declares them (page 0,
            // size 20) and Spring's own defaults are not the same.
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return sellerProductService.listRows(
                q, status, categorySlug, stockBelow, sort, PageRequest.of(page, size));
    }

    /**
     * The whole image ordering at once. PUT because it replaces the ordering
     * rather than adjusting it - see ReorderImagesRequest on why a per-image
     * PATCH cannot express a swap.
     */
    @PutMapping("/api/v1/products/{productId}/images/order")
    public List<SellerProductDetailResponse.SellerImageResponse> reorderImages(
            @PathVariable UUID productId, @Valid @RequestBody ReorderImagesRequest request) {
        return sellerProductService.reorderImages(productId, request.imageIds());
    }

    /** Backs the product drawer's Open orders tile and Active orders list. */
    @GetMapping("/api/v1/sellers/me/products/{productId}/open-orders")
    public ProductOpenOrdersResponse openOrders(@PathVariable UUID productId) {
        return sellerProductService.openOrders(productId);
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
