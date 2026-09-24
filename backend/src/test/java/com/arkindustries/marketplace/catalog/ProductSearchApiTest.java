package com.arkindustries.marketplace.catalog;

import com.arkindustries.marketplace.identity.Seller;
import com.arkindustries.marketplace.identity.SellerRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The "one endpoint end to end" proof: a real HTTP request through
 * Spring Security's filter chain (proving GET /products/** is actually
 * public, not just permitAll() in source that's never exercised) down to
 * a real Postgres and back out as JSON.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProductSearchApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private SellerRepository sellerRepository;

    @Test
    void getProductsIsPublicAndReturnsMatchingSummaries() throws Exception {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("seller3@example.com")
                .fullName("Test Seller Three")
                .build());

        productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title("Mechanical Keyboard")
                .brandName("Keychron")
                .description("Hot-swappable mechanical keyboard")
                .category("electronics")
                .build());

        mockMvc.perform(get("/products").param("q", "mechanical"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].title").value("Mechanical Keyboard"))
                .andExpect(jsonPath("$.content[0].brandName").value("Keychron"));
    }
}
