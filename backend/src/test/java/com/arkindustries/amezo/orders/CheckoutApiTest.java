package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.Offer;
import com.arkindustries.amezo.catalog.OfferRepository;
import com.arkindustries.amezo.catalog.Product;
import com.arkindustries.amezo.catalog.ProductRepository;
import com.arkindustries.amezo.catalog.Variant;
import com.arkindustries.amezo.catalog.VariantRepository;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class CheckoutApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private org.springframework.test.web.servlet.MockMvc mockMvc;

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

    private Offer seedOffer(String emailSuffix, int stockQty, BigDecimal price) {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("checkout-" + emailSuffix + "@example.com").fullName("Checkout Seller").build());
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId()).title("Trail Backpack").category("outdoor").build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Blue / M").sku("SKU-CHK-" + emailSuffix).build());
        return offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(price).stockQty(stockQty).build());
    }

    private String checkoutBody(String variantId, int quantity, BigDecimal expectedUnitPrice) throws Exception {
        String priceField = expectedUnitPrice == null ? "" : ("\"expectedUnitPrice\":" + expectedUnitPrice + ",");
        return """
                {
                  "email": "buyer@example.com",
                  "phone": "+15551234567",
                  "shippingAddress": {
                    "fullName": "Jamie Buyer",
                    "line1": "1 Main St",
                    "city": "Springfield",
                    "state": "IL",
                    "postalCode": "62704",
                    "country": "US"
                  },
                  "sameAsShipping": true,
                  "lines": [
                    { "variantId": "%s", %s "quantity": %d }
                  ]
                }
                """.formatted(variantId, priceField, quantity);
    }

    @Test
    void happyPathCreatesOrderDecrementsStockAndReturnsTheOrder() throws Exception {
        Offer offer = seedOffer("happy", 5, new BigDecimal("20.00"));

        MvcResult result = mockMvc.perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(checkoutBody(offer.getVariantId().toString(), 2, new BigDecimal("20.00"))))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("total").decimalValue()).isEqualByComparingTo("40.00");
        assertThat(body.get("lines")).hasSize(1);
        assertThat(body.get("lines").get(0).get("productTitle").asText()).isEqualTo("Trail Backpack");
        assertThat(body.get("lines").get(0).get("variantLabel").asText()).isEqualTo("Blue / M");
        assertThat(body.get("id").asText()).isNotBlank();

        Offer reloaded = offerRepository.findById(offer.getId()).orElseThrow();
        assertThat(reloaded.getStockQty()).isEqualTo(3);
    }

    @Test
    void outOfStockAbortsTheWholeOrderAndLeavesStockUntouched() throws Exception {
        Offer offer = seedOffer("oos", 1, new BigDecimal("20.00"));

        mockMvc.perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(checkoutBody(offer.getVariantId().toString(), 5, null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/out-of-stock"))
                .andExpect(jsonPath("$.errors[0].field").value("lines[0].variantId"));

        Offer reloaded = offerRepository.findById(offer.getId()).orElseThrow();
        assertThat(reloaded.getStockQty()).isEqualTo(1);
    }

    @Test
    void priceDriftIsReportedSeparatelyFromStock() throws Exception {
        Offer offer = seedOffer("drift", 5, new BigDecimal("25.00"));

        mockMvc.perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(checkoutBody(offer.getVariantId().toString(), 1, new BigDecimal("20.00"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/price-changed"))
                .andExpect(jsonPath("$.errors[0].reason").value("expected 20.00, now 25.00"));

        Offer reloaded = offerRepository.findById(offer.getId()).orElseThrow();
        assertThat(reloaded.getStockQty()).isEqualTo(5);
    }

    @Test
    void billingAddressIsRequiredWhenNotSameAsShipping() throws Exception {
        String body = """
                {
                  "email": "buyer2@example.com",
                  "phone": "+15551234567",
                  "shippingAddress": {
                    "fullName": "Jamie Buyer",
                    "line1": "1 Main St",
                    "city": "Springfield",
                    "state": "IL",
                    "postalCode": "62704",
                    "country": "US"
                  },
                  "sameAsShipping": false,
                  "lines": [ { "variantId": "11111111-1111-1111-1111-111111111111", "quantity": 1 } ]
                }
                """;

        mockMvc.perform(post("/orders").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[?(@.field=='request')]").exists());
    }
}
