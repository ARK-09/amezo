package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.IdentityType;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.identity.Session;
import com.arkindustries.amezo.identity.SessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SellerProductApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private VariantRepository variantRepository;

    @Autowired
    private OfferRepository offerRepository;

    @Test
    void listMineOnlyReturnsTheCallingSellersProducts() throws Exception {
        Seller me = seller("me@example.com");
        Seller other = seller("other@example.com");
        Cookie myCookie = sessionCookieFor(me);

        productRepository.save(Product.builder().sellerId(me.getId()).title("Mine").category("outdoor").build());
        productRepository.save(Product.builder().sellerId(other.getId()).title("Not mine").category("outdoor").build());

        mockMvc.perform(get("/sellers/me/products").cookie(myCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Mine"));
    }

    @Test
    void listMineWithoutASessionReturns401() throws Exception {
        mockMvc.perform(get("/sellers/me/products"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void creatingAProductWritesTheProductAndEveryVariantWithItsOffer() throws Exception {
        Seller me = seller("creator@example.com");
        Cookie cookie = sessionCookieFor(me);

        String body = """
                {
                  "title": "Trail Backpack",
                  "brandName": "Northpeak",
                  "description": "40L hiking backpack",
                  "category": "outdoor",
                  "variants": [
                    { "label": "Blue / M", "sku": "SKU-1", "price": 89.99, "stockQty": 5 },
                    { "label": "Red / L", "sku": "SKU-2", "price": 94.99, "stockQty": 0 }
                  ]
                }
                """;

        String responseBody = mockMvc.perform(post("/products").cookie(cookie)
                        .contentType("application/json").content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        UUID productId = UUID.fromString(objectMapper.readTree(responseBody).get("id").asText());

        Product product = productRepository.findById(productId).orElseThrow();
        assertThat(product.getSellerId()).isEqualTo(me.getId());
        assertThat(product.getTitle()).isEqualTo("Trail Backpack");

        List<Variant> variants = variantRepository.findByProductId(productId);
        assertThat(variants).hasSize(2);
        for (Variant variant : variants) {
            Offer offer = offerRepository.findByVariantId(variant.getId()).orElseThrow();
            assertThat(offer.getPrice()).isNotNull();
        }
    }

    @Test
    void creatingAProductWithNoVariantsFails() throws Exception {
        Seller me = seller("novariant@example.com");
        Cookie cookie = sessionCookieFor(me);

        String body = """
                { "title": "No variants", "category": "outdoor", "variants": [] }
                """;

        mockMvc.perform(post("/products").cookie(cookie).contentType("application/json").content(body))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void deletingAProductRemovesItsVariantsAndOffers() throws Exception {
        Seller me = seller("deleter@example.com");
        Cookie cookie = sessionCookieFor(me);

        Product product = productRepository.save(
                Product.builder().sellerId(me.getId()).title("To delete").category("outdoor").build());
        Variant variant = variantRepository.save(
                Variant.builder().productId(product.getId()).label("Only").sku("SKU-DEL").build());
        offerRepository.save(Offer.builder().variantId(variant.getId()).price(new BigDecimal("10.00")).stockQty(1).build());

        mockMvc.perform(delete("/products/{id}", product.getId()).cookie(cookie))
                .andExpect(status().isNoContent());

        assertThat(productRepository.findById(product.getId())).isEmpty();
        assertThat(variantRepository.findByProductId(product.getId())).isEmpty();
        assertThat(offerRepository.findByVariantId(variant.getId())).isEmpty();
    }

    @Test
    void deletingAnotherSellersProductReturns404() throws Exception {
        Seller me = seller("notowner@example.com");
        Seller owner = seller("realowner@example.com");
        Cookie cookie = sessionCookieFor(me);

        Product product = productRepository.save(
                Product.builder().sellerId(owner.getId()).title("Not yours").category("outdoor").build());

        mockMvc.perform(delete("/products/{id}", product.getId()).cookie(cookie))
                .andExpect(status().isNotFound());

        assertThat(productRepository.findById(product.getId())).isPresent();
    }

    private Seller seller(String email) {
        return sellerRepository.save(Seller.builder().email(email).build());
    }

    private Cookie sessionCookieFor(Seller seller) {
        String rawToken = "test-session-" + UUID.randomUUID();
        sessionRepository.save(Session.builder()
                .identityType(IdentityType.SELLER)
                .identityId(seller.getId())
                .tokenHash(sha256Hex(rawToken))
                .expiresAt(Instant.now().plus(30, ChronoUnit.DAYS))
                .build());
        return new Cookie("mp_session", rawToken);
    }

    private String sha256Hex(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes());
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
