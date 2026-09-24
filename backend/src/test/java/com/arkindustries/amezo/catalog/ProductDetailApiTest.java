package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.ImageResponse;
import com.arkindustries.amezo.catalog.dto.ProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.VariantDetailResponse;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProductDetailApiTest {

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
    private ProductRepository productRepository;

    @Autowired
    private VariantRepository variantRepository;

    @Autowired
    private OfferRepository offerRepository;

    @Autowired
    private ImageRepository imageRepository;

    @Test
    void returnsFullDetailWithFlattenedVariantsOrderedImagesAndOutOfStockMarkedNotFiltered() throws Exception {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("detail1@example.com").fullName("Detail Seller").build());

        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title("Trail Backpack")
                .brandName("Northpeak")
                .description("40L hiking backpack")
                .category("outdoor")
                .build());

        Variant inStockVariant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Blue / M").sku("SKU-DETAIL-A").build());
        offerRepository.save(Offer.builder()
                .variantId(inStockVariant.getId()).price(new BigDecimal("89.99")).stockQty(5).build());

        Variant outOfStockVariant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Red / L").sku("SKU-DETAIL-B").build());
        offerRepository.save(Offer.builder()
                .variantId(outOfStockVariant.getId()).price(new BigDecimal("94.99")).stockQty(0).build());

        // Saved out of position order on purpose, to prove ORDER BY position ASC,
        // not insertion order.
        imageRepository.save(Image.builder()
                .productId(product.getId()).s3Key("detail1/second.jpg")
                .position(2).status(ImageStatus.STORED).build());
        imageRepository.save(Image.builder()
                .productId(product.getId()).s3Key("detail1/first.jpg")
                .position(1).status(ImageStatus.STORED).build());
        // An upload that was presigned but never confirmed - must never appear.
        imageRepository.save(Image.builder()
                .productId(product.getId()).s3Key("detail1/pending.jpg")
                .position(3).status(ImageStatus.PENDING).build());

        MvcResult result = mockMvc.perform(get("/products/{id}", product.getId()))
                .andExpect(status().isOk())
                .andReturn();

        ProductDetailResponse response = objectMapper.readValue(
                result.getResponse().getContentAsString(), ProductDetailResponse.class);

        assertThat(response.title()).isEqualTo("Trail Backpack");
        assertThat(response.brandName()).isEqualTo("Northpeak");
        assertThat(response.category()).isEqualTo("outdoor");
        assertThat(response.description()).isEqualTo("40L hiking backpack");

        assertThat(response.images()).extracting(ImageResponse::position).containsExactly(1, 2);
        assertThat(response.images()).extracting(ImageResponse::url)
                .noneMatch(url -> url.contains("pending"));

        assertThat(response.variants()).hasSize(2);
        VariantDetailResponse inStock = variantWithSku(response, "SKU-DETAIL-A");
        assertThat(inStock.inStock()).isTrue();
        assertThat(inStock.stockQty()).isEqualTo(5);

        VariantDetailResponse outOfStock = variantWithSku(response, "SKU-DETAIL-B");
        assertThat(outOfStock.inStock()).isFalse();
        assertThat(outOfStock.stockQty()).isEqualTo(0);

        // No reviews were created for this product - proves the summary
        // aggregation's zero-row case, not just its happy path.
        assertThat(response.reviewSummary().count()).isEqualTo(0);
        assertThat(response.reviewSummary().averageRating()).isNull();
    }

    @Test
    void returns404ForAMissingProduct() throws Exception {
        mockMvc.perform(get("/products/{id}", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.type").value("https://api/errors/not-found"));
    }

    private static VariantDetailResponse variantWithSku(ProductDetailResponse response, String sku) {
        return response.variants().stream()
                .filter(v -> v.sku().equals(sku))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No variant with sku " + sku));
    }
}
