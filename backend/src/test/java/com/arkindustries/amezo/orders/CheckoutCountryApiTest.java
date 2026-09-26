package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.CategoryRepository;
import com.arkindustries.amezo.catalog.Offer;
import com.arkindustries.amezo.catalog.OfferRepository;
import com.arkindustries.amezo.catalog.Product;
import com.arkindustries.amezo.catalog.ProductRepository;
import com.arkindustries.amezo.catalog.Variant;
import com.arkindustries.amezo.catalog.VariantRepository;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.support.Fixtures;
import com.fasterxml.jackson.databind.JsonNode;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The delivery country has to come from the system list, and the server is where
 * that is decided - a client can always skip the selector.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class CheckoutCountryApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private VariantRepository variantRepository;

    @Autowired
    private OfferRepository offerRepository;

    @Autowired
    private OrderRepository orderRepository;

    /** Public, because checkout is open to guests and the selector renders first. */
    @Test
    void servesTheCountryListWithoutASession() throws Exception {
        MvcResult result = mockMvc.perform(get("/countries"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.size()).isGreaterThan(200);
        assertThat(body.findValuesAsText("code")).contains("US", "GB", "AE", "JP");
        // Ordered by name, which is the order a selector shows.
        assertThat(body.get(0).get("name").asText())
                .isLessThan(body.get(body.size() - 1).get("name").asText());
    }

    @Test
    void acceptsACountryFromTheList() throws Exception {
        UUID variantId = listing("country-ok");

        mockMvc.perform(post("/orders").contentType("application/json")
                        .content(body("country-ok@example.com", variantId, "AE")))
                .andExpect(status().isCreated());
    }

    @Test
    void rejectsACodeThatIsNotACountry() throws Exception {
        UUID variantId = listing("country-bad");
        long before = orderRepository.count();

        mockMvc.perform(post("/orders").contentType("application/json")
                        .content(body("country-bad@example.com", variantId, "XX")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("shippingAddress.country"));

        assertThat(orderRepository.count()).isEqualTo(before);
    }

    /**
     * "UK" earns its own case: it reads like a country code, it is what people type,
     * and the ISO code is GB. Length validation alone would let it through.
     */
    @Test
    void rejectsPlausibleButWrongCodes() throws Exception {
        UUID variantId = listing("country-uk");

        mockMvc.perform(post("/orders").contentType("application/json")
                        .content(body("country-uk@example.com", variantId, "UK")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("shippingAddress.country"));
    }

    /** A separate billing address is validated too, not just the shipping one. */
    @Test
    void validatesTheBillingCountryAsWell() throws Exception {
        UUID variantId = listing("country-billing");

        String withBadBilling = """
            {
              "email": "country-billing@example.com",
              "phone": "+15551234",
              "sameAsShipping": false,
              "lines": [{"variantId": "%s", "quantity": 1}],
              "shippingAddress": {
                "fullName": "Buyer", "line1": "1 Main St", "city": "Springfield",
                "state": "IL", "postalCode": "62701", "country": "US"
              },
              "billingAddress": {
                "fullName": "Buyer", "line1": "1 Main St", "city": "Springfield",
                "state": "IL", "postalCode": "62701", "country": "ZZ"
              }
            }
            """.formatted(variantId);

        mockMvc.perform(post("/orders").contentType("application/json").content(withBadBilling))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("billingAddress.country"));
    }

    /** Blank stays one message, not two: @NotBlank owns it, @ValidCountryCode passes null. */
    @Test
    void reportsAMissingCountryOnce() throws Exception {
        UUID variantId = listing("country-blank");

        MvcResult result = mockMvc.perform(post("/orders").contentType("application/json")
                        .content(body("country-blank@example.com", variantId, "")))
                .andExpect(status().isUnprocessableEntity())
                .andReturn();

        JsonNode errors = objectMapper.readTree(result.getResponse().getContentAsString()).get("errors");
        long countryErrors = errors.findValuesAsText("field").stream()
                .filter("shippingAddress.country"::equals)
                .count();
        assertThat(countryErrors).isEqualTo(1);
    }

    private UUID listing(String key) {
        Seller seller = sellerRepository.save(Seller.builder().email(key + "-seller@example.com").build());
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title(key + " product")
                .slug(key + "-product")
                .categoryId(Fixtures.categoryId(categoryRepository, "outdoor"))
                .build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("One").sku(key + "-sku").build());
        offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("12.00")).stockQty(3).build());
        return variant.getId();
    }

    private String body(String email, UUID variantId, String country) {
        return """
            {
              "email": "%s",
              "phone": "+15551234",
              "sameAsShipping": true,
              "lines": [{"variantId": "%s", "quantity": 1}],
              "shippingAddress": {
                "fullName": "Buyer", "line1": "1 Main St", "city": "Springfield",
                "state": "IL", "postalCode": "62701", "country": "%s"
              }
            }
            """.formatted(email, variantId, country);
    }
}
