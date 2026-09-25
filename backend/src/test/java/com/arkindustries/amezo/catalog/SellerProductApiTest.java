package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.IdentityType;
import com.arkindustries.amezo.orders.api.OfferOrderHistoryQuery;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.identity.Session;
import com.arkindustries.amezo.identity.SessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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

    /**
     * Mocked, not real: confirm HEADs the bucket and delete removes from it, and
     * neither belongs in a test's reach. Stubbing it also makes "the object isn't
     * there" a case that can be asserted rather than waited for.
     */
    @MockitoBean
    private S3Client s3Client;

    /**
     * Mocked so "this product has been sold" is a condition a test can state
     * directly, instead of building an order through another feature's tables to
     * provoke the foreign key underneath it.
     */
    @MockitoBean
    private OfferOrderHistoryQuery offerOrderHistory;

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

        String responseBody = mockMvc.perform(post("/sellers/me/products").cookie(cookie)
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

        mockMvc.perform(post("/sellers/me/products").cookie(cookie).contentType("application/json").content(body))
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

    @Test
    void confirmRecordsTheSizeTheBucketReportsNotTheOneTheClientDeclared() throws Exception {
        Seller me = seller("confirm-size@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Sized").category("outdoor").build());
        Cookie cookie = sessionCookieFor(me);

        // Declared 8 KiB at presign; the object that actually landed is 4242 bytes.
        String uploadResponse = mockMvc.perform(post("/products/" + product.getId() + "/images/upload-url")
                        .cookie(cookie)
                        .contentType("application/json")
                        .content("""
                                {"contentType":"image/jpeg","fileSizeBytes":8192,"position":0}"""))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID imageId = UUID.fromString(objectMapper.readTree(uploadResponse).get("id").asText());

        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenReturn(HeadObjectResponse.builder().contentLength(4242L).build());

        mockMvc.perform(post("/products/" + product.getId() + "/images/confirm")
                        .cookie(cookie)
                        .contentType("application/json")
                        .content("{\"imageId\":\"" + imageId + "\"}"))
                .andExpect(status().isOk());

        Image stored = imageRepository.findById(imageId).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(ImageStatus.STORED);
        // The storage cap sums this column, so it has to be the bucket's number.
        assertThat(stored.getSizeBytes()).isEqualTo(4242L);
    }

    @Test
    void confirmIsRefusedWhenNothingWasEverUploaded() throws Exception {
        Seller me = seller("confirm-missing@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Never uploaded").category("outdoor").build());
        Cookie cookie = sessionCookieFor(me);

        String uploadResponse = mockMvc.perform(post("/products/" + product.getId() + "/images/upload-url")
                        .cookie(cookie)
                        .contentType("application/json")
                        .content("""
                                {"contentType":"image/jpeg","fileSizeBytes":1024,"position":0}"""))
                .andReturn().getResponse().getContentAsString();
        UUID imageId = UUID.fromString(objectMapper.readTree(uploadResponse).get("id").asText());

        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenThrow(NoSuchKeyException.builder().message("not found").build());

        mockMvc.perform(post("/products/" + product.getId() + "/images/confirm")
                        .cookie(cookie)
                        .contentType("application/json")
                        .content("{\"imageId\":\"" + imageId + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/upload-not-found"));

        // Still PENDING: a failed confirm must not leave a row claiming an object
        // that isn't there, or the product page renders a permanent broken image.
        assertThat(imageRepository.findById(imageId).orElseThrow().getStatus())
                .isEqualTo(ImageStatus.PENDING);
    }

    /**
     * The leak this closes: deleting a product used to drop the image rows and
     * leave the objects in the bucket - billed forever, and invisible to the
     * storage cap, which counts rows.
     */
    @Test
    void deletingAProductRemovesItsObjectsFromTheBucket() throws Exception {
        Seller me = seller("delete-objects@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("With images").category("outdoor").build());
        imageRepository.save(Image.builder()
                .productId(product.getId())
                .s3Key("products/" + product.getId() + "/first")
                .position(0).status(ImageStatus.STORED).sizeBytes(1024L).build());
        imageRepository.save(Image.builder()
                .productId(product.getId())
                .s3Key("products/" + product.getId() + "/second")
                .position(1).status(ImageStatus.PENDING).sizeBytes(2048L).build());

        mockMvc.perform(delete("/products/" + product.getId()).cookie(sessionCookieFor(me)))
                .andExpect(status().isNoContent());

        ArgumentCaptor<DeleteObjectRequest> deleted = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3Client, times(2)).deleteObject(deleted.capture());
        assertThat(deleted.getAllValues()).extracting(DeleteObjectRequest::key)
                .containsExactlyInAnyOrder(
                        "products/" + product.getId() + "/first",
                        "products/" + product.getId() + "/second");
    }

    /** A delete the bucket refuses must not fail a delete the database already committed. */
    @Test
    void aBucketFailureDoesNotFailTheProductDelete() throws Exception {
        Seller me = seller("delete-objects-fail@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Stubborn bucket").category("outdoor").build());
        imageRepository.save(Image.builder()
                .productId(product.getId())
                .s3Key("products/" + product.getId() + "/only")
                .position(0).status(ImageStatus.STORED).sizeBytes(512L).build());

        when(s3Client.deleteObject(any(DeleteObjectRequest.class)))
                .thenThrow(SdkClientException.create("bucket unreachable"));

        mockMvc.perform(delete("/products/" + product.getId()).cookie(sessionCookieFor(me)))
                .andExpect(status().isNoContent());

        assertThat(productRepository.findById(product.getId())).isEmpty();
    }
    @Test
    void sellerViewShowsExactStockSkusAndPendingImages() throws Exception {
        Seller me = seller("view-detail@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Viewable").brandName("Acme")
                .description("Full text").category("outdoor").build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Large").sku("VIEW-L").build());
        offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("19.50")).stockQty(0).build());
        imageRepository.save(Image.builder()
                .productId(product.getId()).s3Key("products/" + product.getId() + "/pending")
                .position(0).status(ImageStatus.PENDING).sizeBytes(10L).build());

        mockMvc.perform(get("/sellers/me/products/" + product.getId()).cookie(sessionCookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Viewable"))
                .andExpect(jsonPath("$.description").value("Full text"))
                .andExpect(jsonPath("$.variants[0].sku").value("VIEW-L"))
                // Exact stock, not the buyer-facing inStock flag: 0 is a number the
                // seller edits, not a product to hide.
                .andExpect(jsonPath("$.variants[0].stockQty").value(0))
                // Pending images are visible here so an upload that never finished
                // isn't silently missing from the page.
                .andExpect(jsonPath("$.images[0].status").value("PENDING"));
    }

    @Test
    void anotherSellersProductIsNotFoundForViewOrEdit() throws Exception {
        Seller other = seller("owner@example.com");
        Seller me = seller("intruder@example.com");
        Product theirs = productRepository.save(Product.builder()
                .sellerId(other.getId()).title("Not yours").category("outdoor").build());
        Cookie mine = sessionCookieFor(me);

        mockMvc.perform(get("/sellers/me/products/" + theirs.getId()).cookie(mine))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch("/products/" + theirs.getId()).cookie(mine)
                        .contentType("application/json")
                        .content("""
                                {"title":"Mine now"}"""))
                .andExpect(status().isNotFound());
    }

    @Test
    void patchWritesOnlyTheFieldsItCarries() throws Exception {
        Seller me = seller("patch-product@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Old title").brandName("Keep me")
                .description("Keep this too").category("outdoor").build());

        mockMvc.perform(patch("/products/" + product.getId()).cookie(sessionCookieFor(me))
                        .contentType("application/json")
                        .content("""
                                {"title":"New title"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("New title"))
                .andExpect(jsonPath("$.brandName").value("Keep me"))
                .andExpect(jsonPath("$.description").value("Keep this too"))
                .andExpect(jsonPath("$.category").value("outdoor"));
    }

    @Test
    void patchRejectsABlankTitleRatherThanStoringIt() throws Exception {
        Seller me = seller("patch-blank@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Has a title").category("outdoor").build());

        mockMvc.perform(patch("/products/" + product.getId()).cookie(sessionCookieFor(me))
                        .contentType("application/json")
                        .content("""
                                {"title":"   "}"""))
                .andExpect(status().isUnprocessableEntity());

        assertThat(productRepository.findById(product.getId()).orElseThrow().getTitle())
                .isEqualTo("Has a title");
    }

    /** One request, two tables: label/sku on the variant, price/stock on its offer. */
    @Test
    void patchVariantWritesAcrossBothTables() throws Exception {
        Seller me = seller("patch-variant@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Has variants").category("outdoor").build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Small").sku("PV-S").build());
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("10.00")).stockQty(2).build());

        mockMvc.perform(patch("/variants/" + variant.getId()).cookie(sessionCookieFor(me))
                        .contentType("application/json")
                        .content("""
                                {"label":"Small (relabelled)","price":12.75,"stockQty":9}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("Small (relabelled)"))
                .andExpect(jsonPath("$.price").value(12.75))
                .andExpect(jsonPath("$.stockQty").value(9));

        assertThat(variantRepository.findById(variant.getId()).orElseThrow().getLabel())
                .isEqualTo("Small (relabelled)");
        Offer reloaded = offerRepository.findById(offer.getId()).orElseThrow();
        assertThat(reloaded.getPrice()).isEqualByComparingTo("12.75");
        assertThat(reloaded.getStockQty()).isEqualTo(9);
        // SKU untouched, since the request didn't carry one.
        assertThat(variantRepository.findById(variant.getId()).orElseThrow().getSku()).isEqualTo("PV-S");
    }

    @Test
    void patchVariantRefusesASkuAnotherVariantAlreadyHas() throws Exception {
        Seller me = seller("sku-clash@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Two variants").category("outdoor").build());
        Variant first = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("One").sku("CLASH-1").build());
        offerRepository.save(Offer.builder()
                .variantId(first.getId()).price(new BigDecimal("5.00")).stockQty(1).build());
        Variant second = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Two").sku("CLASH-2").build());
        offerRepository.save(Offer.builder()
                .variantId(second.getId()).price(new BigDecimal("6.00")).stockQty(1).build());

        mockMvc.perform(patch("/variants/" + second.getId()).cookie(sessionCookieFor(me))
                        .contentType("application/json")
                        .content("""
                                {"sku":"CLASH-1"}"""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/sku-taken"));

        assertThat(variantRepository.findById(second.getId()).orElseThrow().getSku()).isEqualTo("CLASH-2");
    }

    /**
     * order_line.offer_id is a real foreign key, so this used to reach the
     * database and come back as a 500 on a constraint name. The seller's real
     * options are in the message.
     */
    @Test
    void deleteIsRefusedWhenTheProductHasBeenOrdered() throws Exception {
        Seller me = seller("sold-product@example.com");
        Product product = productRepository.save(Product.builder()
                .sellerId(me.getId()).title("Already sold").category("outdoor").build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Only").sku("SOLD-1").build());
        offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("8.00")).stockQty(1).build());

        when(offerOrderHistory.anySoldOffer(any())).thenReturn(true);

        mockMvc.perform(delete("/products/" + product.getId()).cookie(sessionCookieFor(me)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/product-has-orders"));

        assertThat(productRepository.findById(product.getId())).isPresent();
    }
}
