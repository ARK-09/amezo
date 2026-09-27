package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.CategoryRepository;
import com.arkindustries.amezo.catalog.Offer;
import com.arkindustries.amezo.catalog.OfferRepository;
import com.arkindustries.amezo.catalog.Product;
import com.arkindustries.amezo.catalog.ProductRepository;
import com.arkindustries.amezo.catalog.Variant;
import com.arkindustries.amezo.catalog.VariantRepository;
import com.arkindustries.amezo.identity.BuyerIdentity;
import com.arkindustries.amezo.identity.BuyerIdentityRepository;
import com.arkindustries.amezo.identity.IdentityType;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.identity.SessionRepository;
import com.arkindustries.amezo.support.Fixtures;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
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
 * Whose order an order is.
 *
 * <h2>The bug</h2>
 *
 * Ownership used to be resolved from the email typed into the checkout FORM, through
 * findOrCreateByEmail. But the contact email on checkout is a field like any other -
 * people put a work address on a work order, a partner's on a gift - so an order
 * placed by a signed-in buyer who typed anything else landed on a SECOND
 * buyer_identity row. It was then invisible in the My Orders of the account that
 * placed it, and unreachable from anywhere: the list is scoped by buyer_identity_id,
 * which is the only column it can be scoped by.
 *
 * Ownership now follows the session. The typed address stays on
 * buyer_email_snapshot, which is what that column is for.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class CheckoutOwnershipApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired private MockMvc mockMvc;
    @Autowired private SellerRepository sellers;
    @Autowired private BuyerIdentityRepository buyers;
    @Autowired private SessionRepository sessions;
    @Autowired private CategoryRepository categories;
    @Autowired private ProductRepository products;
    @Autowired private VariantRepository variants;
    @Autowired private OfferRepository offers;
    @Autowired private OrderRepository orders;

    /**
     * The headline. A signed-in buyer checks out with a different contact address and the
     * order is still theirs.
     *
     * Both halves are asserted: the order appears in THEIR list, and the address they
     * typed is kept on the order rather than discarded - a receipt goes to the address
     * the buyer named, and the seller's queue reads the same column.
     */
    @Test
    void anOrderPlacedWithADifferentContactEmailStaysInTheSignedInBuyersOrders() throws Exception {
        BuyerIdentity buyer = buyer("account");
        Offer offer = offer("42.00");
        Cookie cookie = Fixtures.sessionCookie(sessions, IdentityType.BUYER, buyer.getId());
        String typedEmail = "someone-else-" + UUID.randomUUID() + "@example.com";

        UUID orderId = checkout(cookie, offer, typedEmail);

        // Theirs, by the only column that can decide it.
        assertThat(orders.findById(orderId).orElseThrow().getBuyerIdentityId())
                .isEqualTo(buyer.getId());
        // And the typed address is preserved as what it is: the order's contact address.
        assertThat(orders.findById(orderId).orElseThrow().getBuyerEmailSnapshot())
                .isEqualTo(typedEmail);

        mockMvc.perform(get("/api/v1/orders").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + orderId + "')].id").exists());
        mockMvc.perform(get("/api/v1/orders/" + orderId).cookie(cookie))
                .andExpect(status().isOk());
    }

    /**
     * And it is not quietly filed under the typed address either.
     *
     * No buyer_identity row is created for an address a signed-in buyer merely named as a
     * contact - which is the other half of the fix. Creating one would leave a stray
     * account that anyone could later sign into and find somebody else's order in.
     */
    @Test
    void theTypedAddressDoesNotBecomeAnAccountOfItsOwn() throws Exception {
        BuyerIdentity buyer = buyer("no-stray");
        Offer offer = offer("19.00");
        String typedEmail = "contact-only-" + UUID.randomUUID() + "@example.com";

        checkout(Fixtures.sessionCookie(sessions, IdentityType.BUYER, buyer.getId()), offer, typedEmail);

        assertThat(buyers.findByEmail(typedEmail)).isEmpty();
    }

    /**
     * A guest keeps the old behaviour, because there is no account to prefer.
     *
     * Their email is the only handle on the order, so it resolves or creates the identity
     * exactly as before - and that is also what later lets them sign in and find the
     * order, since the address they used IS their account.
     */
    @Test
    void aGuestOrderStillBelongsToTheAddressTheyGave() throws Exception {
        Offer offer = offer("25.00");
        String guestEmail = "guest-" + UUID.randomUUID() + "@example.com";

        UUID orderId = checkout(null, offer, guestEmail);

        UUID identityId = buyers.findByEmail(guestEmail).orElseThrow().getId();
        assertThat(orders.findById(orderId).orElseThrow().getBuyerIdentityId()).isEqualTo(identityId);

        // Signing in on that address finds it, which is the promise the guest path makes.
        mockMvc.perform(get("/api/v1/orders")
                        .cookie(Fixtures.sessionCookie(sessions, IdentityType.BUYER, identityId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + orderId + "')].id").exists());
    }

    /**
     * A SELLER-primary session still places the order as the buyer half of its own
     * account - one address is one account, so there is no third state where a signed-in
     * person's order belongs to nobody they can reach.
     */
    @Test
    void aSellerBuyingSomethingGetsItInTheirOwnOrderHistory() throws Exception {
        String email = "both-" + UUID.randomUUID() + "@example.com";
        Seller seller = sellers.save(Seller.builder().email(email).build());
        BuyerIdentity buyer = buyers.save(BuyerIdentity.builder()
                .email(email).fullName("Both Halves").build());
        // A DIFFERENT seller's product: buying your own is refused, and that rule has its
        // own test in SellerSelfPurchaseApiTest.
        Offer offer = offer("31.00");

        Cookie cookie = Fixtures.sessionCookie(sessions, IdentityType.SELLER, seller.getId());
        UUID orderId = checkout(cookie, offer, email);

        assertThat(orders.findById(orderId).orElseThrow().getBuyerIdentityId()).isEqualTo(buyer.getId());
        mockMvc.perform(get("/api/v1/orders").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + orderId + "')].id").exists());
    }

    // ------------------------------------------------------------------ helpers

    /** POST /orders, signed in when a cookie is given and as a guest when it is not. */
    private UUID checkout(Cookie cookie, Offer offer, String email) throws Exception {
        var request = post("/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(offer.getVariantId(), email));
        if (cookie != null) {
            request = request.cookie(cookie);
        }
        MvcResult result = mockMvc.perform(request).andExpect(status().isCreated()).andReturn();
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.id"));
    }

    private static String body(UUID variantId, String email) {
        return """
                {
                  "email": "%s",
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
                  "lines": [ { "variantId": "%s", "quantity": 1 } ]
                }
                """.formatted(email, variantId);
    }

    private BuyerIdentity buyer(String tag) {
        return buyers.save(BuyerIdentity.builder()
                .email("checkout-own-" + tag + "-" + UUID.randomUUID() + "@example.com")
                .fullName("Account Holder")
                .build());
    }

    /** A sellable offer from a seller nobody in these tests is signed in as. */
    private Offer offer(String price) {
        Seller seller = sellers.save(Seller.builder()
                .email("checkout-own-seller-" + UUID.randomUUID() + "@example.com").build());
        Product product = products.save(Product.builder()
                .sellerId(seller.getId())
                .title("Trail Backpack")
                .categoryId(Fixtures.categoryId(categories, "outdoor"))
                .slug(Fixtures.uniqueSlug("trail-backpack"))
                .build());
        Variant variant = variants.save(Variant.builder()
                .productId(product.getId())
                .label("Blue / M")
                .sku("SKU-" + UUID.randomUUID())
                .build());
        return offers.save(Offer.builder()
                .variantId(variant.getId())
                .price(new BigDecimal(price))
                .stockQty(5)
                .build());
    }
}
