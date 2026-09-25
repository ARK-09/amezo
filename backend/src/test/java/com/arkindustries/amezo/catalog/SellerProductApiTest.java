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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.sql.Timestamp;
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

    static {
        // Presigning resolves credentials through the SDK's default chain the first
        // time it signs, and CI has none. These two system properties are a link in
        // that chain, so the signing math has a key to work with; nothing ever
        // leaves the JVM - a presigned URL is computed locally, not requested.
        System.setProperty("aws.accessKeyId", "test-access-key");
        System.setProperty("aws.secretAccessKey", "test-secret-key");
    }

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

    @Autowired
    private ImageRepository imageRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

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
    @Test
    void uploadUrlIsRefusedForAFileOverThePerFileLimit() throws Exception {
        Seller me = seller("bigfile@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Has images").category("outdoor").build());

        // 20 MiB against the 10 MiB default in application.yml.
        mockMvc.perform(post("/products/" + product.getId() + "/images/upload-url")
                        .cookie(sessionCookieFor(me))
                        .contentType("application/json")
                        .content("""
                                {"contentType":"image/jpeg","fileSizeBytes":20971520,"position":0}"""))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.type").value("https://api/errors/file-too-large"));
    }

    @Test
    void uploadUrlRequiresADeclaredSize() throws Exception {
        Seller me = seller("nosize@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("No size").category("outdoor").build());

        mockMvc.perform(post("/products/" + product.getId() + "/images/upload-url")
                        .cookie(sessionCookieFor(me))
                        .contentType("application/json")
                        .content("""
                                {"contentType":"image/jpeg","position":0}"""))
                .andExpect(status().isUnprocessableEntity());
    }

    /**
     * The cap is about the deployment's whole bucket, not one seller's: object
     * storage is billed to whoever owns the bucket, so a second seller doesn't get
     * a fresh 10 GiB. Stored bytes here are written straight to the image table -
     * there is no way to actually put 10 GiB into a test bucket, and the sum is
     * what the check reads.
     */
    @Test
    void uploadUrlIsRefusedOnceTheDeploymentsStorageCapIsReached() throws Exception {
        Seller hog = seller("hog@example.com");
        Product hogged = productRepository.save(Product.builder()
                .sellerId(hog.getId()).title("Already full").category("outdoor").build());
        imageRepository.save(Image.builder()
                .productId(hogged.getId())
                .s3Key("products/" + hogged.getId() + "/filler")
                .position(0)
                .status(ImageStatus.STORED)
                .sizeBytes(10L * 1024 * 1024 * 1024)   // the whole 10 GiB default cap
                .build());

        Seller other = seller("other-seller@example.com");
        Product theirs = productRepository.save(Product.builder()
                .sellerId(other.getId()).title("Wants one pixel").category("outdoor").build());

        mockMvc.perform(post("/products/" + theirs.getId() + "/images/upload-url")
                        .cookie(sessionCookieFor(other))
                        .contentType("application/json")
                        .content("""
                                {"contentType":"image/jpeg","fileSizeBytes":1024,"position":0}"""))
                .andExpect(status().isInsufficientStorage())
                .andExpect(jsonPath("$.type").value("https://api/errors/storage-cap-reached"));
    }

    /**
     * Pending uploads count while their URL is live, so concurrent requests can't
     * each see the same headroom and collectively overshoot - but an abandoned one
     * must stop holding quota once the URL it reserved for has expired.
     */
    @Test
    void anExpiredPendingUploadStopsCountingAgainstTheCap() throws Exception {
        Seller me = seller("expired-pending@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Abandoned upload").category("outdoor").build());

        Image abandoned = imageRepository.save(Image.builder()
                .productId(product.getId())
                .s3Key("products/" + product.getId() + "/abandoned")
                .position(0)
                .status(ImageStatus.PENDING)
                .sizeBytes(10L * 1024 * 1024 * 1024)
                .build());

        mockMvc.perform(post("/products/" + product.getId() + "/images/upload-url")
                        .cookie(sessionCookieFor(me))
                        .contentType("application/json")
                        .content("""
                                {"contentType":"image/jpeg","fileSizeBytes":1024,"position":1}"""))
                .andExpect(status().isInsufficientStorage());

        // Older than the 15-minute upload-URL TTL: the reservation is void, and so
        // is its hold on the cap. Aged in SQL because created_at is
        // @CreationTimestamp + updatable = false - JPA silently drops a change to
        // it, so a save() here would assert nothing.
        jdbcTemplate.update("UPDATE image SET created_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)), abandoned.getId());

        mockMvc.perform(post("/products/" + product.getId() + "/images/upload-url")
                        .cookie(sessionCookieFor(me))
                        .contentType("application/json")
                        .content("""
                                {"contentType":"image/jpeg","fileSizeBytes":1024,"position":1}"""))
                .andExpect(status().isCreated());
    }
}
