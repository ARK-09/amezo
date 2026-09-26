package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.CategoryRepository;
import com.arkindustries.amezo.catalog.Offer;
import com.arkindustries.amezo.catalog.OfferRepository;
import com.arkindustries.amezo.catalog.Product;
import com.arkindustries.amezo.catalog.ProductRepository;
import com.arkindustries.amezo.catalog.Variant;
import com.arkindustries.amezo.catalog.VariantRepository;
import com.arkindustries.amezo.identity.IdentityType;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.identity.SessionRepository;
import com.arkindustries.amezo.support.Fixtures;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A seller cannot buy their own listing.
 *
 * Both routes in are covered, because the interesting one is not the obvious one:
 * a signed-in seller is easy to spot, and the bypass is to sign out and check out
 * as a guest with the same email. Checkout is open to guests by design, so the
 * email is the check that cannot be sidestepped.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SellerSelfPurchaseApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CategoryRepository categoryRepository;

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
    private OrderRepository orderRepository;

    /** Signed in as the seller of the product in the cart. */
    @Test
    void refusesASignedInSellerBuyingTheirOwnProduct() throws Exception {
        Seller seller = sellerRepository.save(Seller.builder().email("self-signedin@example.com").build());
        UUID variantId = listing(seller, "self-signedin");
        Cookie session = Fixtures.sessionCookie(sessionRepository, IdentityType.SELLER, seller.getId());
        long ordersBefore = orderRepository.count();

        mockMvc.perform(post("/orders").cookie(session)
                        .contentType("application/json")
                        .content(checkoutBody("someone-else@example.com", variantId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/own-product"))
                // Itemised, so a cart of ten tells the buyer which line is the problem.
                .andExpect(jsonPath("$.errors[0].field").value("lines[0].variantId"));

        assertThat(orderRepository.count()).isEqualTo(ordersBefore);
    }

    /**
     * The real bypass: no session at all, but the buyer email on the order is the
     * seller's own. An order cannot be placed without an email, so this always has
     * something to check.
     */
    @Test
    void refusesAGuestCheckoutUsingTheSellersOwnEmail() throws Exception {
        String email = "self-guest@example.com";
        Seller seller = sellerRepository.save(Seller.builder().email(email).build());
        UUID variantId = listing(seller, "self-guest");
        long ordersBefore = orderRepository.count();

        mockMvc.perform(post("/orders")
                        .contentType("application/json")
                        .content(checkoutBody(email, variantId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/own-product"));

        assertThat(orderRepository.count()).isEqualTo(ordersBefore);
    }

    /** The ordinary case still works - this rule must not block real buyers. */
    @Test
    void allowsAnUnrelatedBuyer() throws Exception {
        Seller seller = sellerRepository.save(Seller.builder().email("self-other@example.com").build());
        UUID variantId = listing(seller, "self-other");

        mockMvc.perform(post("/orders")
                        .contentType("application/json")
                        .content(checkoutBody("genuine-buyer@example.com", variantId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lines[0].quantity").value(1));
    }

    /** A seller buying somebody else's product is a normal purchase. */
    @Test
    void allowsASellerBuyingAnotherSellersProduct() throws Exception {
        Seller theirs = sellerRepository.save(Seller.builder().email("self-theirs@example.com").build());
        Seller mine = sellerRepository.save(Seller.builder().email("self-mine@example.com").build());
        UUID variantId = listing(theirs, "self-cross");
        Cookie session = Fixtures.sessionCookie(sessionRepository, IdentityType.SELLER, mine.getId());

        mockMvc.perform(post("/orders").cookie(session)
                        .contentType("application/json")
                        .content(checkoutBody("self-mine@example.com", variantId)))
                .andExpect(status().isCreated());
    }

    /**
     * A mixed cart is refused as a whole, and names only the offending line - the
     * buyer's next move is to remove that one, not to guess.
     */
    @Test
    void refusesTheWholeOrderAndNamesOnlyTheOwnLine() throws Exception {
        String email = "self-mixed@example.com";
        Seller seller = sellerRepository.save(Seller.builder().email(email).build());
        Seller other = sellerRepository.save(Seller.builder().email("self-mixed-other@example.com").build());
        UUID theirVariant = listing(other, "self-mixed-theirs");
        UUID ownVariant = listing(seller, "self-mixed-own");
        long ordersBefore = orderRepository.count();

        String body = """
            {
              "email": "%s",
              "phone": "+15551234",
              "sameAsShipping": true,
              "lines": [
                {"variantId": "%s", "quantity": 1},
                {"variantId": "%s", "quantity": 1}
              ],
              "shippingAddress": {
                "fullName": "Mixed Cart", "line1": "1 Main St", "city": "Springfield",
                "state": "IL", "postalCode": "62701", "country": "US"
              }
            }
            """.formatted(email, theirVariant, ownVariant);

        mockMvc.perform(post("/orders").contentType("application/json").content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors.length()").value(1))
                .andExpect(jsonPath("$.errors[0].field").value("lines[1].variantId"));

        assertThat(orderRepository.count()).isEqualTo(ordersBefore);
    }

    /**
     * Reported before stock and price, because this is a rule about who may buy at
     * all - an "out of stock" message would hide it and send the seller off fixing
     * the wrong thing.
     */
    @Test
    void reportsOwnProductEvenWhenTheLineIsAlsoOutOfStock() throws Exception {
        String email = "self-nostock@example.com";
        Seller seller = sellerRepository.save(Seller.builder().email(email).build());
        UUID variantId = listing(seller, "self-nostock", 0);

        mockMvc.perform(post("/orders")
                        .contentType("application/json")
                        .content(checkoutBody(email, variantId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/own-product"));
    }

    private UUID listing(Seller seller, String key) {
        return listing(seller, key, 5);
    }

    private UUID listing(Seller seller, String key, int stockQty) {
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title(key + " product")
                .slug(key + "-product")
                .categoryId(Fixtures.categoryId(categoryRepository, "outdoor"))
                .build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("One").sku(key + "-sku").build());
        offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("30.00")).stockQty(stockQty).build());
        return variant.getId();
    }

    private String checkoutBody(String email, UUID variantId) {
        return """
            {
              "email": "%s",
              "phone": "+15551234",
              "sameAsShipping": true,
              "lines": [{"variantId": "%s", "quantity": 1}],
              "shippingAddress": {
                "fullName": "Test Buyer", "line1": "1 Main St", "city": "Springfield",
                "state": "IL", "postalCode": "62701", "country": "US"
              }
            }
            """.formatted(email, variantId);
    }
}
