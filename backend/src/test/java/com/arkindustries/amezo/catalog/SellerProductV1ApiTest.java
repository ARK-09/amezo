package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.IdentityType;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.identity.SessionRepository;
import com.arkindustries.amezo.orders.api.OfferOrderHistoryQuery;
import com.arkindustries.amezo.orders.api.OpenOrderLine;
import com.arkindustries.amezo.orders.api.ProductOpenOrdersQuery;
import com.arkindustries.amezo.support.Fixtures;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import software.amazon.awssdk.services.s3.S3Client;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The /api/v1 seller-product surface: the filtered product list, the image
 * reorder, the open-orders read, and product.status round-tripping through
 * create/update/detail.
 *
 * Separate from SellerProductApiTest, which covers the unversioned routes and
 * is already long. The two share no state and could be merged; they are apart
 * because the subject here is new surface, and a failure should name which.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SellerProductV1ApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        // Same reason as SellerProductApiTest: presigning resolves credentials
        // through the SDK's default chain the first time it signs, and CI has
        // none. Nothing leaves the JVM - a presigned URL is computed locally.
        System.setProperty("aws.accessKeyId", "test-access-key");
        System.setProperty("aws.secretAccessKey", "test-secret-key");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private CategoryRepository categoryRepository;

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

    @MockitoBean
    private S3Client s3Client;

    @MockitoBean
    private OfferOrderHistoryQuery offerOrderHistory;

    /**
     * Mocked so "this product has two open orders" is a condition a test states
     * directly. Building it for real would mean creating orders through another
     * feature's tables, which is exactly the coupling ProductOpenOrdersQuery
     * exists to prevent - and it is the contract between the features, not the
     * order rows, that this test is about.
     */
    @MockitoBean
    private ProductOpenOrdersQuery productOpenOrders;

    // ---------------------------------------------------------------- listing

    @Test
    void listRowsOnlyReturnsTheCallingSellersProducts() throws Exception {
        Seller me = seller("v1-me@example.com");
        Seller other = seller("v1-other@example.com");
        productWithOffer(me, "Mine", "electronics", ProductStatus.ACTIVE, new BigDecimal("10.00"), 5);
        productWithOffer(other, "Theirs", "electronics", ProductStatus.ACTIVE, new BigDecimal("10.00"), 5);

        mockMvc.perform(get("/api/v1/sellers/me/products").cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Mine"));
    }

    @Test
    void listRowsWithoutASessionIs401() throws Exception {
        mockMvc.perform(get("/api/v1/sellers/me/products"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void listRowsCarriesTheAggregatesTheScreenPrints() throws Exception {
        Seller me = seller("v1-agg@example.com");
        Product product = product(me, "Two variants", "electronics", ProductStatus.ACTIVE);
        variantWithOffer(product, "Cheap", new BigDecimal("10.00"), 4);
        variantWithOffer(product, "Dear", new BigDecimal("30.00"), 6);
        storedImage(product, 0);
        storedImage(product, 1);

        mockMvc.perform(get("/api/v1/sellers/me/products").cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].variantCount").value(2))
                .andExpect(jsonPath("$.content[0].totalStock").value(10))
                .andExpect(jsonPath("$.content[0].priceFrom").value(10.00))
                .andExpect(jsonPath("$.content[0].priceTo").value(30.00))
                .andExpect(jsonPath("$.content[0].imageCount").value(2))
                .andExpect(jsonPath("$.content[0].productRef").value(product.getSlug()))
                .andExpect(jsonPath("$.content[0].status").value("ACTIVE"));
    }

    /**
     * A PENDING image is an upload that never landed. Counting it would make the
     * row promise a picture that renders broken.
     */
    @Test
    void listRowsCountsOnlyStoredImages() throws Exception {
        Seller me = seller("v1-pending@example.com");
        Product product = productWithOffer(me, "Half uploaded", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("10.00"), 1);
        storedImage(product, 0);
        imageRepository.save(Image.builder()
                .productId(product.getId()).s3Key("k-pending").position(1)
                .status(ImageStatus.PENDING).sizeBytes(1L).build());

        mockMvc.perform(get("/api/v1/sellers/me/products").cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].imageCount").value(1));
    }

    @Test
    void listRowsFiltersByStatus() throws Exception {
        Seller me = seller("v1-status-filter@example.com");
        productWithOffer(me, "Live one", "electronics", ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);
        productWithOffer(me, "Draft one", "electronics", ProductStatus.DRAFT, new BigDecimal("1.00"), 1);

        mockMvc.perform(get("/api/v1/sellers/me/products?status=DRAFT").cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Draft one"));
    }

    /**
     * The buyer-facing search_vector is built from title, brand and description
     * and contains no SKU at all, so this filter cannot be that one.
     */
    @Test
    void listRowsSearchMatchesSku() throws Exception {
        Seller me = seller("v1-sku@example.com");
        Product product = product(me, "Nothing in the title", "electronics", ProductStatus.ACTIVE);
        variantWithOfferSku(product, "Only", "FINDME-123", new BigDecimal("5.00"), 1);
        productWithOffer(me, "Decoy", "electronics", ProductStatus.ACTIVE, new BigDecimal("5.00"), 1);

        mockMvc.perform(get("/api/v1/sellers/me/products?q=findme").cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Nothing in the title"));
    }

    @Test
    void listRowsFiltersByStockBelow() throws Exception {
        Seller me = seller("v1-stock@example.com");
        productWithOffer(me, "Plenty", "electronics", ProductStatus.ACTIVE, new BigDecimal("1.00"), 50);
        productWithOffer(me, "Nearly out", "electronics", ProductStatus.ACTIVE, new BigDecimal("1.00"), 2);

        mockMvc.perform(get("/api/v1/sellers/me/products?stockBelow=10").cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Nearly out"));
    }

    @Test
    void listRowsSortsByPriceAscending() throws Exception {
        Seller me = seller("v1-sort@example.com");
        productWithOffer(me, "Dear", "electronics", ProductStatus.ACTIVE, new BigDecimal("90.00"), 1);
        productWithOffer(me, "Cheap", "electronics", ProductStatus.ACTIVE, new BigDecimal("3.00"), 1);

        mockMvc.perform(get("/api/v1/sellers/me/products?sort=price_asc").cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].title").value("Cheap"))
                .andExpect(jsonPath("$.content[1].title").value("Dear"));
    }

    /**
     * Refused rather than quietly served in the default order: a client asking
     * for an ordering that does not exist should hear so.
     */
    @Test
    void listRowsRejectsAnUnknownSort() throws Exception {
        Seller me = seller("v1-badsort@example.com");

        mockMvc.perform(get("/api/v1/sellers/me/products?sort=cheapest").cookie(cookieFor(me)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("https://api/errors/unknown-sort"));
    }

    // ----------------------------------------------------------------- status

    @Test
    void statusSurvivesCreateAndComesBackOnDetail() throws Exception {
        Seller me = seller("v1-create-status@example.com");
        Fixtures.categoryId(categoryRepository, "electronics");

        String body = """
                {"title":"Draft product","categorySlug":"electronics","status":"DRAFT",
                 "variants":[{"label":"Only","sku":"V1-DRAFT-1","price":9.99,"stockQty":3}]}""";

        String created = mockMvc.perform(post("/sellers/me/products")
                        .cookie(cookieFor(me)).contentType("application/json").content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = created.replaceAll(".*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mockMvc.perform(get("/sellers/me/products/" + id).cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    @Test
    void createWithoutAStatusDefaultsToActive() throws Exception {
        Seller me = seller("v1-default-status@example.com");
        Fixtures.categoryId(categoryRepository, "electronics");

        String body = """
                {"title":"No status given","categorySlug":"electronics",
                 "variants":[{"label":"Only","sku":"V1-DEFAULT-1","price":9.99,"stockQty":3}]}""";

        String created = mockMvc.perform(post("/sellers/me/products")
                        .cookie(cookieFor(me)).contentType("application/json").content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = created.replaceAll(".*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mockMvc.perform(get("/sellers/me/products/" + id).cookie(cookieFor(me)))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void updateSwitchesStatusAndLeavesItAloneWhenOmitted() throws Exception {
        Seller me = seller("v1-patch-status@example.com");
        Product product = productWithOffer(me, "Switchable", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);

        mockMvc.perform(patch("/products/" + product.getId())
                        .cookie(cookieFor(me)).contentType("application/json")
                        .content("{\"status\":\"DRAFT\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));

        // null means untouched - a title-only PATCH must not republish a draft.
        mockMvc.perform(patch("/products/" + product.getId())
                        .cookie(cookieFor(me)).contentType("application/json")
                        .content("{\"title\":\"Renamed\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Renamed"))
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    @Test
    void updateRefusesArchivedBecauseItIsTheDeletesBusiness() throws Exception {
        Seller me = seller("v1-archive@example.com");
        Product product = productWithOffer(me, "Not archivable", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);

        mockMvc.perform(patch("/products/" + product.getId())
                        .cookie(cookieFor(me)).contentType("application/json")
                        .content("{\"status\":\"ARCHIVED\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("https://api/errors/status-not-settable"));
    }

    /**
     * The response, not just the row: @UpdateTimestamp lands at flush, and
     * without an explicit one the PATCH returns the pre-edit timestamp and the
     * drawer that just saved shows a stale "Last updated".
     */
    @Test
    void updateReturnsTheNewUpdatedAt() throws Exception {
        Seller me = seller("v1-updatedat@example.com");
        Product product = productWithOffer(me, "Touch me", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);
        Instant createdAt = product.getCreatedAt();

        String response = mockMvc.perform(patch("/products/" + product.getId())
                        .cookie(cookieFor(me)).contentType("application/json")
                        .content("{\"title\":\"Touched\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String updatedAt = response.replaceAll(".*\"updatedAt\"\\s*:\\s*\"([^\"]+)\".*", "$1");
        org.assertj.core.api.Assertions.assertThat(Instant.parse(updatedAt)).isAfter(createdAt);
    }

    // ---------------------------------------------------------- image reorder

    @Test
    void reorderRenumbersEveryImageFromTheSubmittedOrder() throws Exception {
        Seller me = seller("v1-reorder@example.com");
        Product product = productWithOffer(me, "Gallery", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);
        Image first = storedImage(product, 0);
        Image second = storedImage(product, 1);
        Image third = storedImage(product, 2);

        mockMvc.perform(put("/api/v1/products/" + product.getId() + "/images/order")
                        .cookie(cookieFor(me)).contentType("application/json")
                        .content("{\"imageIds\":[\"%s\",\"%s\",\"%s\"]}"
                                .formatted(third.getId(), first.getId(), second.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(third.getId().toString()))
                .andExpect(jsonPath("$[0].position").value(0))
                .andExpect(jsonPath("$[1].id").value(first.getId().toString()))
                .andExpect(jsonPath("$[1].position").value(1))
                .andExpect(jsonPath("$[2].id").value(second.getId().toString()))
                .andExpect(jsonPath("$[2].position").value(2));
    }

    @Test
    void reorderRefusesAPartialListWith422() throws Exception {
        Seller me = seller("v1-reorder-partial@example.com");
        Product product = productWithOffer(me, "Gallery", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);
        Image first = storedImage(product, 0);
        storedImage(product, 1);

        mockMvc.perform(put("/api/v1/products/" + product.getId() + "/images/order")
                        .cookie(cookieFor(me)).contentType("application/json")
                        .content("{\"imageIds\":[\"%s\"]}".formatted(first.getId())))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("https://api/errors/invalid-image-order"));
    }

    @Test
    void reorderRefusesAnImageFromAnotherProductWith422() throws Exception {
        Seller me = seller("v1-reorder-foreign@example.com");
        Seller other = seller("v1-reorder-foreign-other@example.com");
        Product mine = productWithOffer(me, "Mine", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);
        Product theirs = productWithOffer(other, "Theirs", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);
        Image myImage = storedImage(mine, 0);
        Image theirImage = storedImage(theirs, 0);

        mockMvc.perform(put("/api/v1/products/" + mine.getId() + "/images/order")
                        .cookie(cookieFor(me)).contentType("application/json")
                        .content("{\"imageIds\":[\"%s\",\"%s\"]}"
                                .formatted(myImage.getId(), theirImage.getId())))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("https://api/errors/invalid-image-order"));
    }

    @Test
    void reorderRefusesDuplicateIdsWith422() throws Exception {
        Seller me = seller("v1-reorder-dupe@example.com");
        Product product = productWithOffer(me, "Gallery", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);
        Image first = storedImage(product, 0);
        storedImage(product, 1);

        mockMvc.perform(put("/api/v1/products/" + product.getId() + "/images/order")
                        .cookie(cookieFor(me)).contentType("application/json")
                        .content("{\"imageIds\":[\"%s\",\"%s\"]}".formatted(first.getId(), first.getId())))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("https://api/errors/invalid-image-order"));
    }

    /** Someone else's product is a 404, never a 403 - an id is not a capability. */
    @Test
    void reorderOnAnotherSellersProductIs404() throws Exception {
        Seller me = seller("v1-reorder-404@example.com");
        Seller other = seller("v1-reorder-404-other@example.com");
        Product theirs = productWithOffer(other, "Theirs", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);
        Image theirImage = storedImage(theirs, 0);

        mockMvc.perform(put("/api/v1/products/" + theirs.getId() + "/images/order")
                        .cookie(cookieFor(me)).contentType("application/json")
                        .content("{\"imageIds\":[\"%s\"]}".formatted(theirImage.getId())))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------ open orders

    @Test
    void openOrdersCountsDistinctOrdersAndSumsUnits() throws Exception {
        Seller me = seller("v1-openorders@example.com");
        Product product = product(me, "Wanted", "electronics", ProductStatus.ACTIVE);
        Variant midnight = variantWithOffer(product, "Midnight", new BigDecimal("10.00"), 5);
        Variant sand = variantWithOffer(product, "Sand", new BigDecimal("10.00"), 5);

        UUID orderOne = UUID.randomUUID();
        UUID orderTwo = UUID.randomUUID();
        when(productOpenOrders.findOpenLines(any())).thenReturn(List.of(
                // Two lines on ONE order: two lines to show, one order to chase.
                new OpenOrderLine(orderOne, UUID.randomUUID(), midnight.getId(),
                        "buyer1@example.com", 1, "PLACED", Instant.now()),
                new OpenOrderLine(orderOne, UUID.randomUUID(), sand.getId(),
                        "buyer1@example.com", 2, "PLACED", Instant.now()),
                new OpenOrderLine(orderTwo, UUID.randomUUID(), midnight.getId(),
                        "buyer2@example.com", 3, "SHIPPED", Instant.now())));

        mockMvc.perform(get("/api/v1/sellers/me/products/" + product.getId() + "/open-orders")
                        .cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openOrderCount").value(2))
                .andExpect(jsonPath("$.reservedUnits").value(6))
                .andExpect(jsonPath("$.orders.length()").value(3))
                // The label is resolved on this side, from catalog's own table:
                // orders only ever hands over the variant id.
                .andExpect(jsonPath("$.orders[0].variantLabel").value("Midnight"))
                .andExpect(jsonPath("$.orders[1].variantLabel").value("Sand"))
                .andExpect(jsonPath("$.orders[2].status").value("SHIPPED"));
    }

    @Test
    void openOrdersIsEmptyWhenNothingIsOutstanding() throws Exception {
        Seller me = seller("v1-noorders@example.com");
        Product product = productWithOffer(me, "Unwanted", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);
        when(productOpenOrders.findOpenLines(any())).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/sellers/me/products/" + product.getId() + "/open-orders")
                        .cookie(cookieFor(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openOrderCount").value(0))
                .andExpect(jsonPath("$.reservedUnits").value(0))
                .andExpect(jsonPath("$.orders.length()").value(0));
    }

    @Test
    void openOrdersForAnotherSellersProductIs404() throws Exception {
        Seller me = seller("v1-openorders-404@example.com");
        Seller other = seller("v1-openorders-404-other@example.com");
        Product theirs = productWithOffer(other, "Theirs", "electronics",
                ProductStatus.ACTIVE, new BigDecimal("1.00"), 1);

        mockMvc.perform(get("/api/v1/sellers/me/products/" + theirs.getId() + "/open-orders")
                        .cookie(cookieFor(me)))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------- fixtures

    private Seller seller(String email) {
        return sellerRepository.save(Seller.builder().email(email).build());
    }

    private Cookie cookieFor(Seller seller) {
        return Fixtures.sessionCookie(sessionRepository, IdentityType.SELLER, seller.getId());
    }

    private Product product(Seller owner, String title, String categorySlug, ProductStatus status) {
        return productRepository.save(Product.builder()
                .sellerId(owner.getId())
                .title(title)
                .brandName("Fixture Brand")
                .slug(Fixtures.uniqueSlug(title))
                .categoryId(Fixtures.categoryId(categoryRepository, categorySlug))
                .status(status)
                .build());
    }

    private Product productWithOffer(
            Seller owner, String title, String categorySlug, ProductStatus status,
            BigDecimal price, int stockQty) {
        Product product = product(owner, title, categorySlug, status);
        variantWithOffer(product, "Only", price, stockQty);
        return product;
    }

    private Variant variantWithOffer(Product product, String label, BigDecimal price, int stockQty) {
        return variantWithOfferSku(product, label, "SKU-" + UUID.randomUUID(), price, stockQty);
    }

    private Variant variantWithOfferSku(
            Product product, String label, String sku, BigDecimal price, int stockQty) {
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label(label).sku(sku).build());
        offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(price).stockQty(stockQty).build());
        return variant;
    }

    private Image storedImage(Product product, int position) {
        return imageRepository.save(Image.builder()
                .productId(product.getId())
                .s3Key("products/" + product.getId() + "/" + UUID.randomUUID())
                .position(position)
                .status(ImageStatus.STORED)
                .sizeBytes(1024L)
                .build());
    }
}
