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
import jakarta.persistence.EntityManager;
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
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/v1/orders, /facets and /{orderId} - the buyer's My Orders backend.
 *
 * Every test mints its own seller, buyer and products with a UUID-suffixed email
 * and slug, and asserts only on rows it created itself. Nothing here reads "all
 * orders" or a fixed count, so the class passes in any order and alongside the
 * other suites sharing the container's database - which is how a test about
 * pagination avoids failing because a sibling suite happened to insert an order.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class BuyerOrderApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final String PHONE = "+15551234567";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private BuyerIdentityRepository buyerIdentityRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private CategoryRepository categoryRepository;

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
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    // -----------------------------------------------------------------
    // Authorization: the door.
    // -----------------------------------------------------------------

    @Test
    void listRefuses401WithoutASession() throws Exception {
        mockMvc.perform(get("/api/v1/orders")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/orders/facets")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/orders/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
    }

    @Test
    void aSellerSessionCannotReadABuyersOrders() throws Exception {
        Seller seller = seller();
        Cookie sellerCookie = cookie(IdentityType.SELLER, seller.getId());

        // 403, not 401: the cookie is valid, the role is wrong. This is the whole
        // reason /api/v1/orders/** needed its own hasRole("BUYER") matcher rather
        // than riding on anything already in SecurityConfig.
        mockMvc.perform(get("/api/v1/orders").cookie(sellerCookie)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/orders/facets").cookie(sellerCookie)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/orders/" + UUID.randomUUID()).cookie(sellerCookie))
                .andExpect(status().isForbidden());
    }

    @Test
    void oneBuyerNeverSeesAnothersOrders() throws Exception {
        Seller seller = seller();
        BuyerIdentity mine = buyer();
        BuyerIdentity theirs = buyer();

        Order myOrder = order(seller, mine, OrderStatus.PLACED, "My Headphones", new BigDecimal("10.00"), 1);
        Order theirOrder = order(seller, theirs, OrderStatus.PLACED, "Their Laptop", new BigDecimal("99.00"), 1);

        Cookie myCookie = cookie(IdentityType.BUYER, mine.getId());

        mockMvc.perform(get("/api/v1/orders").cookie(myCookie).param("q", "Headphones"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(myOrder.getId().toString()));

        // The other buyer's order is invisible to search...
        mockMvc.perform(get("/api/v1/orders").cookie(myCookie).param("q", "Their Laptop"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));

        // ...and 404, not 403, when asked for by id. A 403 would confirm it exists.
        mockMvc.perform(get("/api/v1/orders/" + theirOrder.getId()).cookie(myCookie))
                .andExpect(status().isNotFound());
    }

    @Test
    void aBuyerCanReadTheirOwnOrderById() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Order order = order(seller, buyer, OrderStatus.PLACED, "Readable", new BigDecimal("5.00"), 1);

        mockMvc.perform(get("/api/v1/orders/" + order.getId()).cookie(cookie(IdentityType.BUYER, buyer.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(order.getId().toString()));
    }

    // -----------------------------------------------------------------
    // The detail body, field by field.
    // -----------------------------------------------------------------

    @Test
    void detailCarriesLinesMoneyTimelineAndTheStorefront() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        // 2 x 12.50 = 25.00, and itemCount counts items rather than lines.
        Order order = order(seller, buyer, OrderStatus.SHIPPED, "Desk Lamp", new BigDecimal("12.50"), 2);
        order.setTrackingNumber("1Z-TEST-0001");
        order.setShippedAt(Instant.now().minus(1, ChronoUnit.DAYS));
        orderRepository.save(order);

        mockMvc.perform(get("/api/v1/orders/" + order.getId()).cookie(cookie(IdentityType.BUYER, buyer.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reference").value("ord_" + order.getId().toString().substring(0, 8)))
                .andExpect(jsonPath("$.status").value("SHIPPED"))
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.lines.length()").value(1))
                .andExpect(jsonPath("$.lines[0].productTitle").value("Desk Lamp"))
                .andExpect(jsonPath("$.lines[0].variantLabel").value("Test Variant"))
                .andExpect(jsonPath("$.lines[0].quantity").value(2))
                .andExpect(jsonPath("$.lines[0].unitPrice").value(12.50))
                .andExpect(jsonPath("$.lines[0].lineTotal").value(25.00))
                .andExpect(jsonPath("$.lines[0].productRef").isNotEmpty())
                // Refund fields exist on the wire and are null - nothing in this
                // feature invents refund state.
                .andExpect(jsonPath("$.lines[0].refundRequestId").isEmpty())
                .andExpect(jsonPath("$.lines[0].refundStatus").isEmpty())
                .andExpect(jsonPath("$.subtotal").value(25.00))
                .andExpect(jsonPath("$.shipping").value(0))
                .andExpect(jsonPath("$.tax").value(0))
                .andExpect(jsonPath("$.total").value(25.00))
                // The storefront, provisioned on first read from the seller record.
                .andExpect(jsonPath("$.seller.name").isNotEmpty())
                .andExpect(jsonPath("$.seller.handle").isNotEmpty())
                .andExpect(jsonPath("$.shippingAddress.city").value("Springfield"))
                .andExpect(jsonPath("$.shippingAddress.country").value("US"))
                // billing_same_as_shipping was set, so billingAddress is not
                // echoed back as a duplicate.
                .andExpect(jsonPath("$.billingAddress").isEmpty())
                .andExpect(jsonPath("$.shipment.trackingNumber").value("1Z-TEST-0001"))
                .andExpect(jsonPath("$.shipment.shippedAt").isNotEmpty())
                // No column carries these; they are null rather than invented.
                .andExpect(jsonPath("$.shipment.carrier").isEmpty())
                .andExpect(jsonPath("$.shipment.estimatedDeliveryAt").isEmpty())
                .andExpect(jsonPath("$.refundWindowEndsAt").isEmpty())
                .andExpect(jsonPath("$.canRequestRefund").value(false))
                // Four stages, the ones this schema can actually express. PACKED joined
                // them with V24's status and packed_at; IN_TRANSIT and
                // OUT_FOR_DELIVERY are carrier codes nothing here can report, and
                // drawing them would tell the buyer their parcel never travelled.
                .andExpect(jsonPath("$.timeline.length()").value(4))
                .andExpect(jsonPath("$.timeline[0].code").value("PLACED"))
                .andExpect(jsonPath("$.timeline[0].completed").value(true))
                .andExpect(jsonPath("$.timeline[0].at").isNotEmpty())
                .andExpect(jsonPath("$.timeline[1].code").value("PACKED"))
                // Shipped without a recorded packing step, so the stage is complete
                // and carries no date rather than borrowing the shipment's.
                .andExpect(jsonPath("$.timeline[1].completed").value(true))
                .andExpect(jsonPath("$.timeline[1].at").isEmpty())
                .andExpect(jsonPath("$.timeline[2].code").value("SHIPPED"))
                .andExpect(jsonPath("$.timeline[2].completed").value(true))
                .andExpect(jsonPath("$.timeline[3].code").value("DELIVERED"))
                .andExpect(jsonPath("$.timeline[3].completed").value(false))
                .andExpect(jsonPath("$.timeline[3].at").isEmpty());
    }

    @Test
    void canRequestRefundIsTrueOnlyOnceDelivered() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());

        Order placed = order(seller, buyer, OrderStatus.PLACED, "Not yet", new BigDecimal("1.00"), 1);
        Order delivered = order(seller, buyer, OrderStatus.DELIVERED, "Arrived", new BigDecimal("1.00"), 1);

        mockMvc.perform(get("/api/v1/orders/" + placed.getId()).cookie(cookie))
                .andExpect(jsonPath("$.canRequestRefund").value(false));
        mockMvc.perform(get("/api/v1/orders/" + delivered.getId()).cookie(cookie))
                .andExpect(jsonPath("$.canRequestRefund").value(true));
    }

    @Test
    void anOrderWhoseProductWasDeletedStillReads() throws Exception {
        // productIdSnapshot is deliberately not a foreign key (see V10). A buyer's
        // history must survive the seller deleting the product.
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Order order = order(seller, buyer, OrderStatus.DELIVERED, "Vanishing", new BigDecimal("3.00"), 1);

        OrderLine line = orderLineRepository.findByOrderId(order.getId()).getFirst();
        line.setProductIdSnapshot(UUID.randomUUID());
        line.setVariantIdSnapshot(UUID.randomUUID());
        orderLineRepository.save(line);

        mockMvc.perform(get("/api/v1/orders/" + order.getId()).cookie(cookie(IdentityType.BUYER, buyer.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].productTitle").value("(product removed)"))
                .andExpect(jsonPath("$.lines[0].variantLabel").value("(variant removed)"))
                .andExpect(jsonPath("$.lines[0].productRef").isEmpty())
                .andExpect(jsonPath("$.total").value(3.00));
    }

    // -----------------------------------------------------------------
    // The list: summaries, preview lines, ordering, pagination.
    // -----------------------------------------------------------------

    @Test
    void summariesCarryItemCountsAndAtMostTwoPreviewLines() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Order order = order(seller, buyer, OrderStatus.PLACED, "First Item", new BigDecimal("4.00"), 3);
        addLine(order, seller, "Second Item", new BigDecimal("1.00"), 1);
        addLine(order, seller, "Third Item", new BigDecimal("2.00"), 1);

        mockMvc.perform(get("/api/v1/orders").cookie(cookie(IdentityType.BUYER, buyer.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                // 3 + 1 + 1 items across three lines.
                .andExpect(jsonPath("$.content[0].itemCount").value(5))
                // 12.00 + 1.00 + 2.00, every line, not just the previewed ones.
                .andExpect(jsonPath("$.content[0].total").value(15.00))
                .andExpect(jsonPath("$.content[0].previewLines.length()").value(2))
                .andExpect(jsonPath("$.content[0].openRefundRequestId").isEmpty())
                .andExpect(jsonPath("$.content[0].openRefundStatus").isEmpty());
    }

    @Test
    void searchMatchesAProductTitleOnALineThePreviewDoesNotShow() throws Exception {
        // The card shows two lines; search has to see all of them, or an order is
        // findable only by whichever products happened to sort first.
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Order order = order(seller, buyer, OrderStatus.PLACED, "Alpha", new BigDecimal("1.00"), 1);
        addLine(order, seller, "Bravo", new BigDecimal("1.00"), 1);
        addLine(order, seller, "Charlie Hidden", new BigDecimal("1.00"), 1);

        mockMvc.perform(get("/api/v1/orders").cookie(cookie(IdentityType.BUYER, buyer.getId()))
                        .param("q", "Charlie Hidden"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(order.getId().toString()));
    }

    @Test
    void searchMatchesTheOrderReferenceWholeOrPartAndIgnoringCase() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Order order = order(seller, buyer, OrderStatus.PLACED, "Referenced", new BigDecimal("1.00"), 1);
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());

        String hex = order.getId().toString().substring(0, 8);

        for (String term : new String[] {"ord_" + hex, hex, hex.substring(0, 4), ("ORD_" + hex).toUpperCase()}) {
            mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", term))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content[0].id").value(order.getId().toString()));
        }
    }

    @Test
    void newestFirstAndPagedGenuinely() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());

        // Five orders, placed one day apart, oldest first so the response has to
        // reverse them. Searched by a shared title so the assertions see exactly
        // these five whatever else is in the database.
        String tag = "PageTest" + UUID.randomUUID().toString().substring(0, 8);
        Order[] placed = new Order[5];
        for (int day = 0; day < 5; day++) {
            placed[day] = order(seller, buyer, OrderStatus.PLACED, tag + " " + day, new BigDecimal("1.00"), 1);
            placed[day].setStatus(OrderStatus.PLACED);
            // placed_at is @CreationTimestamp, so it is set on insert and moved
            // here - all five otherwise land inside the same millisecond.
            placed[day] = withPlacedAt(placed[day], Instant.now().minus(5 - day, ChronoUnit.DAYS));
        }

        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("size", "2").param("page", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").doesNotExist())
                .andExpect(jsonPath("$.totalElements").value(5))
                .andExpect(jsonPath("$.totalPages").value(3))
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.content[0].id").value(placed[4].getId().toString()))
                .andExpect(jsonPath("$.content[1].id").value(placed[3].getId().toString()));

        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("size", "2").param("page", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(2))
                .andExpect(jsonPath("$.totalElements").value(5))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(placed[0].getId().toString()));

        // A page past the end is an empty slice, not an error - and totalPages
        // still says where the list ends.
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("size", "2").param("page", "9"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(5))
                .andExpect(jsonPath("$.totalPages").value(3));
    }

    // -----------------------------------------------------------------
    // Filters.
    // -----------------------------------------------------------------

    @Test
    void groupNarrowsTheListAndEachBucketMeansWhatTheTabSays() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());
        String tag = "Group" + UUID.randomUUID().toString().substring(0, 8);

        Order placed = order(seller, buyer, OrderStatus.PLACED, tag + " placed", new BigDecimal("1.00"), 1);
        Order shipped = order(seller, buyer, OrderStatus.SHIPPED, tag + " shipped", new BigDecimal("1.00"), 1);
        Order delivered = order(seller, buyer, OrderStatus.DELIVERED, tag + " delivered", new BigDecimal("1.00"), 1);

        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("group", "all"))
                .andExpect(jsonPath("$.totalElements").value(3));

        // In progress is everything not finished - PLACED and SHIPPED, not
        // DELIVERED.
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("group", "in_progress"))
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("group", "delivered"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(delivered.getId().toString()));

        // Zero because this database has no refund rows, not because the count is
        // hard-coded: the bucket is computed from the same predicate as the others.
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("group", "refunds"))
                .andExpect(jsonPath("$.totalElements").value(0));

        // An absent group is ALL, so both orders above stay reachable.
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag))
                .andExpect(jsonPath("$.totalElements").value(3));

        // status is the finer filter the contract keeps beside group.
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("status", "SHIPPED"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(shipped.getId().toString()));
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("status", "PLACED"))
                .andExpect(jsonPath("$.content[0].id").value(placed.getId().toString()));
    }

    @Test
    void fromAndToNarrowByPlacedAtWithAnInclusiveUpperDay() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());
        String tag = "Window" + UUID.randomUUID().toString().substring(0, 8);

        Order old = withPlacedAt(
                order(seller, buyer, OrderStatus.PLACED, tag + " old", new BigDecimal("1.00"), 1),
                Instant.now().minus(400, ChronoUnit.DAYS));
        Order recent = withPlacedAt(
                order(seller, buyer, OrderStatus.PLACED, tag + " recent", new BigDecimal("1.00"), 1),
                Instant.now().minus(5, ChronoUnit.DAYS));

        String thirtyDaysAgo = LocalDate.now(ZoneOffset.UTC).minusDays(30).toString();

        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag).param("from", thirtyDaysAgo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(recent.getId().toString()));

        // No window: both.
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag))
                .andExpect(jsonPath("$.totalElements").value(2));

        // `to` is a date, and an order placed ON that date is inside the window -
        // the bound is the start of the following day.
        String recentDay = recent.getPlacedAt().atZone(ZoneOffset.UTC).toLocalDate().toString();
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag)
                        .param("from", recentDay).param("to", recentDay))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(recent.getId().toString()));

        // And the old one is only reachable with a window wide enough for it.
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag)
                        .param("from", LocalDate.now(ZoneOffset.UTC).minusDays(500).toString())
                        .param("to", LocalDate.now(ZoneOffset.UTC).minusDays(399).toString()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(old.getId().toString()));
    }

    // -----------------------------------------------------------------
    // Facets.
    // -----------------------------------------------------------------

    @Test
    void facetsDescribeEveryBucketAndAreNotNarrowedByTheSelectedTab() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());
        String tag = "Facet" + UUID.randomUUID().toString().substring(0, 8);

        order(seller, buyer, OrderStatus.PLACED, tag + " a", new BigDecimal("1.00"), 1);
        order(seller, buyer, OrderStatus.SHIPPED, tag + " b", new BigDecimal("1.00"), 1);
        order(seller, buyer, OrderStatus.DELIVERED, tag + " c", new BigDecimal("1.00"), 1);
        order(seller, buyer, OrderStatus.DELIVERED, tag + " d", new BigDecimal("1.00"), 1);

        // The four buckets, in tab order, keyed by the values the list accepts.
        mockMvc.perform(get("/api/v1/orders/facets").cookie(cookie).param("q", tag))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.facets.length()").value(4))
                .andExpect(jsonPath("$.facets[0].key").value("all"))
                .andExpect(jsonPath("$.facets[0].count").value(4))
                .andExpect(jsonPath("$.facets[0].value").isEmpty())
                .andExpect(jsonPath("$.facets[0].currency").isEmpty())
                .andExpect(jsonPath("$.facets[1].key").value("in_progress"))
                .andExpect(jsonPath("$.facets[1].count").value(2))
                .andExpect(jsonPath("$.facets[2].key").value("delivered"))
                .andExpect(jsonPath("$.facets[2].count").value(2))
                .andExpect(jsonPath("$.facets[3].key").value("refunds"))
                .andExpect(jsonPath("$.facets[3].count").value(0));

        // The point of a separate endpoint: a `group` on the query must NOT zero
        // the other tabs. Every count is identical to the un-grouped call above.
        mockMvc.perform(get("/api/v1/orders/facets").cookie(cookie).param("q", tag).param("group", "delivered"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.facets[0].count").value(4))
                .andExpect(jsonPath("$.facets[1].count").value(2))
                .andExpect(jsonPath("$.facets[2].count").value(2));
    }

    @Test
    void facetCountsAgreeWithTheListTheTabOpens() throws Exception {
        // The reason the counts share a pipeline with the list. If these ever
        // disagree, a tab reads "2" and opens a list of one.
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());
        String tag = "Agree" + UUID.randomUUID().toString().substring(0, 8);

        order(seller, buyer, OrderStatus.PLACED, tag + " a", new BigDecimal("1.00"), 1);
        order(seller, buyer, OrderStatus.DELIVERED, tag + " b", new BigDecimal("1.00"), 1);

        mockMvc.perform(get("/api/v1/orders/facets").cookie(cookie).param("q", tag).param("from", LocalDate.now().minusDays(30).toString()))
                .andExpect(jsonPath("$.facets[1].count").value(1))
                .andExpect(jsonPath("$.facets[2].count").value(1));

        String thirtyDaysAgo = LocalDate.now(ZoneOffset.UTC).minusDays(30).toString();
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag)
                        .param("group", "in_progress").param("from", thirtyDaysAgo))
                .andExpect(jsonPath("$.totalElements").value(1));
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("q", tag)
                        .param("group", "delivered").param("from", thirtyDaysAgo))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void facetPeriodNarrowsTheWindow() throws Exception {
        Seller seller = seller();
        BuyerIdentity buyer = buyer();
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());
        String tag = "Period" + UUID.randomUUID().toString().substring(0, 8);

        withPlacedAt(order(seller, buyer, OrderStatus.PLACED, tag + " recent", new BigDecimal("1.00"), 1),
                Instant.now().minus(5, ChronoUnit.DAYS));
        withPlacedAt(order(seller, buyer, OrderStatus.PLACED, tag + " ancient", new BigDecimal("1.00"), 1),
                Instant.now().minus(400, ChronoUnit.DAYS));

        mockMvc.perform(get("/api/v1/orders/facets").cookie(cookie).param("q", tag).param("from", LocalDate.now().minusDays(30).toString()))
                .andExpect(jsonPath("$.facets[0].count").value(1));
        mockMvc.perform(get("/api/v1/orders/facets").cookie(cookie).param("q", tag).param("from", LocalDate.now().minusDays(365).toString()))
                .andExpect(jsonPath("$.facets[0].count").value(1));
        mockMvc.perform(get("/api/v1/orders/facets").cookie(cookie).param("q", tag))
                .andExpect(jsonPath("$.facets[0].count").value(2));
        // Absent means all time.
        mockMvc.perform(get("/api/v1/orders/facets").cookie(cookie).param("q", tag))
                .andExpect(jsonPath("$.facets[0].count").value(2));
    }

    // -----------------------------------------------------------------
    // Validation.
    // -----------------------------------------------------------------

    @Test
    void unknownGroupAndPeriodAre422NamingTheField() throws Exception {
        BuyerIdentity buyer = buyer();
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());

        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("group", "nonsense"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("group"));

        mockMvc.perform(get("/api/v1/orders/facets").cookie(cookie).param("from", "not-a-date"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anUnusablePageOrSizeIs422() throws Exception {
        BuyerIdentity buyer = buyer();
        Cookie cookie = cookie(IdentityType.BUYER, buyer.getId());

        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("page", "-1"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("page"));
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("size", "0"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("size"));
        // A whole buyer history in one response is not on offer.
        mockMvc.perform(get("/api/v1/orders").cookie(cookie).param("size", "100000"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("size"));
    }

    @Test
    void anOrderIdThatDoesNotExistIs404() throws Exception {
        BuyerIdentity buyer = buyer();
        mockMvc.perform(get("/api/v1/orders/" + UUID.randomUUID())
                        .cookie(cookie(IdentityType.BUYER, buyer.getId())))
                .andExpect(status().isNotFound());
    }

    // -----------------------------------------------------------------
    // Fixtures. Every identity is unique per call, so nothing here depends on
    // the order the tests run in or on what another suite left behind.
    // -----------------------------------------------------------------

    private Seller seller() {
        return sellerRepository.save(Seller.builder()
                .email("buyer-orders-seller-" + UUID.randomUUID() + "@example.com")
                .build());
    }

    private BuyerIdentity buyer() {
        return buyerIdentityRepository.save(BuyerIdentity.builder()
                .email("buyer-orders-" + UUID.randomUUID() + "@example.com")
                .fullName("Test Buyer")
                .build());
    }

    private Cookie cookie(IdentityType type, UUID identityId) {
        return Fixtures.sessionCookie(sessionRepository, type, identityId);
    }

    private Order order(
            Seller seller, BuyerIdentity buyer, OrderStatus status, String productTitle,
            BigDecimal unitPrice, int quantity) {

        Order order = orderRepository.save(Order.builder()
                .buyerIdentityId(buyer.getId())
                .buyerEmailSnapshot(buyer.getEmail())
                .buyerPhone(PHONE)
                .shippingAddress(address())
                .billingAddress(address())
                .billingSameAsShipping(true)
                .status(status)
                .build());
        addLine(order, seller, productTitle, unitPrice, quantity);
        return order;
    }

    /**
     * placed_at is @CreationTimestamp AND updatable = false, so it is assigned on
     * insert and Hibernate will not write it again - setPlacedAt + save is a
     * silent no-op. Moved with a direct UPDATE, the same way SellerMetricsApiTest
     * backdates order_line.created_at, and the only way to get orders that are
     * genuinely days apart: several inserts in one test otherwise share a
     * millisecond and "newest first" has nothing to order by.
     *
     * The entity is then re-read so the returned copy carries the new timestamp
     * rather than the one the insert assigned.
     */
    private Order withPlacedAt(Order order, Instant placedAt) {
        jdbcTemplate.update(
                "UPDATE orders SET placed_at = ? WHERE id = ?", Timestamp.from(placedAt), order.getId());
        entityManager.clear();
        return orderRepository.findById(order.getId()).orElseThrow();
    }

    private void addLine(Order order, Seller seller, String productTitle, BigDecimal unitPrice, int quantity) {
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title(productTitle)
                .categoryId(Fixtures.categoryId(categoryRepository, "buyer-orders-test"))
                .slug(Fixtures.uniqueSlug(productTitle))
                .build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId())
                .label("Test Variant")
                .sku("SKU-" + UUID.randomUUID())
                .build());
        // order_line.offer_id is a real FK (V10), unlike the snapshots beside it.
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId())
                .price(unitPrice)
                .stockQty(0)
                .build());

        orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(offer.getId())
                .productIdSnapshot(product.getId())
                .variantIdSnapshot(variant.getId())
                .sellerIdSnapshot(seller.getId())
                .unitPriceSnapshot(unitPrice)
                .quantity(quantity)
                .build());
    }

    private Address address() {
        return Address.builder()
                .fullName("Test Buyer")
                .line1("1 Main St")
                .city("Springfield")
                .state("IL")
                .postalCode("62701")
                .country("US")
                .build();
    }
}
