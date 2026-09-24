package com.arkindustries.amezo.reviews;

import com.arkindustries.amezo.catalog.Offer;
import com.arkindustries.amezo.catalog.OfferRepository;
import com.arkindustries.amezo.catalog.Product;
import com.arkindustries.amezo.catalog.ProductRepository;
import com.arkindustries.amezo.catalog.Variant;
import com.arkindustries.amezo.catalog.VariantRepository;
import com.arkindustries.amezo.identity.BuyerIdentity;
import com.arkindustries.amezo.identity.BuyerIdentityRepository;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.orders.Address;
import com.arkindustries.amezo.orders.Order;
import com.arkindustries.amezo.orders.OrderLine;
import com.arkindustries.amezo.orders.OrderLineRepository;
import com.arkindustries.amezo.orders.OrderRepository;
import com.arkindustries.amezo.orders.OrderStatus;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Fixture setup here freely crosses catalog/identity/orders/reviews - fine
 * for test code (PackageBoundaryTest excludes tests entirely), not fine for
 * the production classes under test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ReviewsApiTest {

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
    private BuyerIdentityRepository buyerIdentityRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private VariantRepository variantRepository;

    @Autowired
    private OfferRepository offerRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderLineRepository orderLineRepository;

    @Autowired
    private ReviewRepository reviewRepository;

    @Test
    void returnsReviewsNewestFirstWithTheVariantLabelBought() throws Exception {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("reviews-seller1@example.com").fullName("Reviews Seller").build());
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId()).title("Mechanical Keyboard").category("electronics").build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Hot-Swappable / White").sku("SKU-REVIEWS-A").build());
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("149.00")).stockQty(3).build());

        // Two distinct buyers - the review table's unique(buyer_identity_id,
        // product_id) constraint means one buyer can't leave two reviews on
        // the same product, so "newest first" needs two different buyers.
        Review older = reviewFor(seller, product, variant, offer, "buyer-older@example.com", 4, "Pretty good");
        // A real gap, not a comment claiming ordering is fine: @CreationTimestamp
        // is wall-clock, and two inserts in the same millisecond would tie.
        Thread.sleep(10);
        Review newer = reviewFor(seller, product, variant, offer, "buyer-newer@example.com", 5, "Excellent");

        MvcResult result = mockMvc.perform(get("/products/{id}/reviews", product.getId()))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode page = objectMapper.readTree(result.getResponse().getContentAsString());
        JsonNode content = page.get("content");

        assertThat(content).hasSize(2);
        assertThat(content.get(0).get("id").asText()).isEqualTo(newer.getId().toString());
        assertThat(content.get(0).get("rating").asInt()).isEqualTo(5);
        assertThat(content.get(0).get("variantLabel").asText()).isEqualTo("Hot-Swappable / White");
        assertThat(content.get(1).get("id").asText()).isEqualTo(older.getId().toString());
        assertThat(page.get("totalElements").asInt()).isEqualTo(2);
    }

    @Test
    void returnsAnEmptyPageNotAnErrorForAProductWithNoReviews() throws Exception {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("reviews-seller2@example.com").fullName("Reviews Seller Two").build());
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId()).title("Standing Desk").category("furniture").build());

        mockMvc.perform(get("/products/{id}/reviews", product.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void returns404ForAMissingProduct() throws Exception {
        mockMvc.perform(get("/products/{id}/reviews", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("https://api/errors/not-found"));
    }

    private Review reviewFor(
            Seller seller, Product product, Variant variant, Offer offer, String buyerEmail, int rating, String body) {
        BuyerIdentity buyer = buyerIdentityRepository.save(BuyerIdentity.builder()
                .email(buyerEmail).fullName("Test Buyer").build());
        Address address = Address.builder()
                .fullName("Test Buyer").line1("1 Main St").city("Springfield")
                .state("IL").postalCode("62704").country("US").build();
        Order order = orderRepository.save(Order.builder()
                .buyerIdentityId(buyer.getId()).sellerId(seller.getId())
                .buyerEmailSnapshot(buyer.getEmail()).buyerPhone("+15551234567")
                .shippingAddress(address).billingSameAsShipping(true).billingAddress(address)
                .status(OrderStatus.DELIVERED).build());
        OrderLine orderLine = orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId()).offerId(offer.getId())
                .productIdSnapshot(product.getId()).variantIdSnapshot(variant.getId())
                .sellerIdSnapshot(seller.getId()).unitPriceSnapshot(offer.getPrice()).quantity(1).build());
        return reviewRepository.save(Review.builder()
                .orderLineId(orderLine.getId()).buyerIdentityId(buyer.getId()).productId(product.getId())
                .rating(rating).body(body).build());
    }
}
