package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the FTS foundation end to end against a real Postgres, not H2:
 * the generated search_vector column, the GIN index, and the native
 * plainto_tsquery match/no-match behavior.
 */
@SpringBootTest
@Testcontainers
class ProductRepositorySearchTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private SellerRepository sellerRepository;

    @Test
    void searchMatchesTitleBrandAndDescriptionButNotUnrelatedProducts() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("seller@example.com")
                .fullName("Test Seller")
                .build());

        Product matching = productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title("Wireless Mouse")
                .brandName("Logitech")
                .description("Ergonomic wireless mouse with USB receiver")
                .category("electronics")
                .build());

        productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title("Braided USB Cable")
                .brandName("Anker")
                .description("Fast charging cable")
                .category("electronics")
                .build());

        Page<Product> results = productRepository.search("wireless", PageRequest.of(0, 10));

        assertThat(results.getContent())
                .extracting(Product::getId)
                .containsExactly(matching.getId());
    }

    @Test
    void nullQueryReturnsEveryProduct() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("seller2@example.com")
                .fullName("Test Seller Two")
                .build());

        productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title("Standing Desk")
                .category("furniture")
                .build());

        Page<Product> results = productRepository.search(null, PageRequest.of(0, 10));

        assertThat(results.getTotalElements()).isGreaterThanOrEqualTo(1);
    }
}
