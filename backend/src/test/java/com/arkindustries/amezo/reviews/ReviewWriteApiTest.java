package com.arkindustries.amezo.reviews;

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
import com.arkindustries.amezo.orders.Address;
import com.arkindustries.amezo.orders.Order;
import com.arkindustries.amezo.orders.OrderLine;
import com.arkindustries.amezo.orders.OrderLineRepository;
import com.arkindustries.amezo.orders.OrderRepository;
import com.arkindustries.amezo.orders.OrderStatus;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Who may write a review. The rule is "only someone who bought it", and the only
 * place that can be enforced is here - a frontend that hides the form is a courtesy,
 * not a control, so every case below goes straight at the API.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ReviewWriteApiTest {

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
    private BuyerIdentityRepository buyerIdentityRepository;

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

    @Autowired
    private OrderLineRepository orderLineRepository;

    @Autowired
    private ReviewRepository reviewRepository;

    /** No session at all: the door is shut before any purchase check runs. */
    @Test
    void refusesAnAnonymousReview() throws Exception {
        mockMvc.perform(post("/reviews")
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"11111111-1111-1111-1111-111111111111\",\"rating\":5}"))
                .andExpect(status().isUnauthorized());

        assertThat(reviewRepository.count()).isZero();
    }

    /**
     * A SELLER session is a valid session and still not a buyer. Worth its own case:
     * the seller portal is the one place a session reliably exists, so it is the
     * likeliest cookie to be pointed at this endpoint.
     */
    @Test
    void refusesASellerSession() throws Exception {
        Seller seller = sellerRepository.save(Seller.builder().email("rw-seller-role@example.com").build());
        Cookie sellerSession = Fixtures.sessionCookie(sessionRepository, IdentityType.SELLER, seller.getId());

        mockMvc.perform(post("/reviews").cookie(sellerSession)
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"11111111-1111-1111-1111-111111111111\",\"rating\":5}"))
                .andExpect(status().isForbidden());
    }

    /** A signed-in buyer who never bought this product has no line to cite. */
    @Test
    void tellsABuyerWhoNeverBoughtItThatTheyCannotReview() throws Exception {
        Fixture fixture = fixture("rw-notbought");
        Cookie stranger = buyerSession("rw-stranger@example.com");

        mockMvc.perform(get("/products/{slug}/reviews/eligibility", fixture.product.getSlug())
                        .cookie(stranger))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").value(false))
                .andExpect(jsonPath("$.reason").value("NOT_PURCHASED"))
                .andExpect(jsonPath("$.orderLineId").doesNotExist());
    }

    /**
     * The bypass this check exists for: a signed-in buyer citing an order line that
     * belongs to somebody else. An order line id is not a capability.
     */
    @Test
    void refusesAnOrderLineBelongingToAnotherBuyer() throws Exception {
        Fixture fixture = fixture("rw-notmine");
        UUID otherLine = purchase(fixture, "rw-realbuyer@example.com");
        Cookie imposter = buyerSession("rw-imposter@example.com");

        mockMvc.perform(post("/reviews").cookie(imposter)
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"" + otherLine + "\",\"rating\":1,\"body\":\"Never bought it\"}"))
                .andExpect(status().isForbidden());

        assertThat(reviewRepository.count()).isZero();
    }

    @Test
    void refusesAnOrderLineThatDoesNotExist() throws Exception {
        Cookie buyer = buyerSession("rw-ghostline@example.com");

        mockMvc.perform(post("/reviews").cookie(buyer)
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"99999999-9999-9999-9999-999999999999\",\"rating\":5}"))
                .andExpect(status().isNotFound());
    }

    /** The happy path, and the eligibility read that leads a client to it. */
    @Test
    void acceptsAReviewFromTheBuyerWhoBoughtIt() throws Exception {
        Fixture fixture = fixture("rw-happy");
        String email = "rw-buyer@example.com";
        UUID line = purchase(fixture, email);
        Cookie buyer = buyerSession(email);

        mockMvc.perform(get("/products/{slug}/reviews/eligibility", fixture.product.getSlug()).cookie(buyer))
                .andExpect(jsonPath("$.eligible").value(true))
                .andExpect(jsonPath("$.orderLineId").value(line.toString()));

        mockMvc.perform(post("/reviews").cookie(buyer)
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"" + line + "\",\"rating\":5,\"body\":\"Exactly as described\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.rating").value(5))
                .andExpect(jsonPath("$.variantLabel").value("Standard"))
                // Populated, not null - the page has a date to show for a review
                // the buyer just wrote.
                .andExpect(jsonPath("$.createdAt").isNotEmpty());

        // And it is visible to everyone, with the product's rating updated.
        mockMvc.perform(get("/products/{slug}/reviews", fixture.product.getSlug()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].body").value("Exactly as described"));
        mockMvc.perform(get("/products/{slug}", fixture.product.getSlug()))
                .andExpect(jsonPath("$.reviewSummary.averageRating").value(5.0))
                .andExpect(jsonPath("$.reviewSummary.count").value(1));
    }

    /** Ratings on the listing card come from a batched aggregate, so check them there too. */
    @Test
    void showsTheAverageRatingOnTheListing() throws Exception {
        Fixture fixture = fixture("rw-listing");
        String email = "rw-listingbuyer@example.com";
        UUID line = purchase(fixture, email);

        mockMvc.perform(post("/reviews").cookie(buyerSession(email))
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"" + line + "\",\"rating\":4}"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/products").param("q", fixture.product.getTitle()))
                .andExpect(jsonPath("$.content[0].avgRating").value(4.0));
    }

    /**
     * One review per product, which is what the schema has always said
     * (UNIQUE (buyer_identity_id, product_id)). Buying it twice doesn't buy a second
     * review, and the second attempt says so rather than 500ing on the constraint.
     */
    @Test
    void refusesASecondReviewOfTheSameProduct() throws Exception {
        Fixture fixture = fixture("rw-dup");
        String email = "rw-dupbuyer@example.com";
        UUID firstLine = purchase(fixture, email);
        UUID secondLine = purchase(fixture, email);
        Cookie buyer = buyerSession(email);

        mockMvc.perform(post("/reviews").cookie(buyer)
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"" + firstLine + "\",\"rating\":5}"))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/reviews").cookie(buyer)
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"" + secondLine + "\",\"rating\":1,\"body\":\"Second thoughts\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/already-reviewed"));

        assertThat(reviewRepository.findAll().stream()
                .filter(r -> r.getProductId().equals(fixture.product.getId()))
                .count()).isEqualTo(1);
    }

    /** Afterwards the page says so, and shows them what they wrote. */
    @Test
    void reportsAnExistingReviewBackToItsAuthor() throws Exception {
        Fixture fixture = fixture("rw-existing");
        String email = "rw-existingbuyer@example.com";
        UUID line = purchase(fixture, email);
        Cookie buyer = buyerSession(email);

        mockMvc.perform(post("/reviews").cookie(buyer)
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"" + line + "\",\"rating\":3,\"body\":\"It is fine\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/products/{slug}/reviews/eligibility", fixture.product.getSlug()).cookie(buyer))
                .andExpect(jsonPath("$.eligible").value(false))
                .andExpect(jsonPath("$.reason").value("ALREADY_REVIEWED"))
                .andExpect(jsonPath("$.existingReview.rating").value(3))
                .andExpect(jsonPath("$.existingReview.body").value("It is fine"));
    }

    @Test
    void rejectsARatingOutsideOneToFive() throws Exception {
        Fixture fixture = fixture("rw-badrating");
        String email = "rw-badrating-buyer@example.com";
        UUID line = purchase(fixture, email);
        Cookie buyer = buyerSession(email);

        mockMvc.perform(post("/reviews").cookie(buyer)
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"" + line + "\",\"rating\":6}"))
                .andExpect(status().isUnprocessableEntity());
        mockMvc.perform(post("/reviews").cookie(buyer)
                        .contentType("application/json")
                        .content("{\"orderLineId\":\"" + line + "\",\"rating\":0}"))
                .andExpect(status().isUnprocessableEntity());
    }

    /** Eligibility is buyer-scoped, so it must not answer an anonymous caller. */
    @Test
    void refusesAnAnonymousEligibilityRead() throws Exception {
        Fixture fixture = fixture("rw-anoneligible");

        mockMvc.perform(get("/products/{slug}/reviews/eligibility", fixture.product.getSlug()))
                .andExpect(status().isUnauthorized());
    }

    // --- fixtures ---

    private record Fixture(Product product, Variant variant, Offer offer, Seller seller) {
    }

    private Fixture fixture(String key) {
        Seller seller = sellerRepository.save(Seller.builder().email(key + "-seller@example.com").build());
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title(key + " product")
                .slug(key + "-product")
                .categoryId(Fixtures.categoryId(categoryRepository, "electronics"))
                .build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Standard").sku(key + "-sku").build());
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("25.00")).stockQty(10).build());
        return new Fixture(product, variant, offer, seller);
    }

    /** An order line for this buyer, i.e. the purchase that makes them eligible. */
    private UUID purchase(Fixture fixture, String buyerEmail) {
        BuyerIdentity buyer = buyerIdentityRepository.findByEmail(buyerEmail)
                .orElseGet(() -> buyerIdentityRepository.save(
                        BuyerIdentity.builder().email(buyerEmail).fullName("Buyer " + buyerEmail).build()));

        Address address = Address.builder()
                .fullName("Buyer").line1("1 Main St").city("Springfield").state("IL")
                .postalCode("62701").country("US").build();
        Order order = orderRepository.save(Order.builder()
                .buyerIdentityId(buyer.getId())
                .buyerEmailSnapshot(buyerEmail)
                .buyerPhone("+15550000")
                .shippingAddress(address)
                .billingSameAsShipping(true)
                .billingAddress(address)
                .status(OrderStatus.PLACED)
                .build());

        return orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(fixture.offer.getId())
                .productIdSnapshot(fixture.product.getId())
                .variantIdSnapshot(fixture.variant.getId())
                .sellerIdSnapshot(fixture.seller.getId())
                .unitPriceSnapshot(new BigDecimal("25.00"))
                .quantity(1)
                .build()).getId();
    }

    private Cookie buyerSession(String email) {
        BuyerIdentity buyer = buyerIdentityRepository.findByEmail(email)
                .orElseGet(() -> buyerIdentityRepository.save(
                        BuyerIdentity.builder().email(email).fullName("Buyer " + email).build()));
        return Fixtures.sessionCookie(sessionRepository, IdentityType.BUYER, buyer.getId());
    }
}
