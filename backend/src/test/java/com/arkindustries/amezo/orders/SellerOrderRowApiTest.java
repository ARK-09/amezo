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
import com.arkindustries.amezo.identity.Session;
import com.arkindustries.amezo.identity.SessionRepository;
import com.arkindustries.amezo.support.Fixtures;
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
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The /api/v1 seller order surface the Seller Orders screen calls.
 *
 * Every one of these paths answered 404 before: the frontend has called
 * /api/v1/sellers/me/orders, its /facets, /{orderId} and that PATCH since the portal
 * was built, and the only controller that existed served the unprefixed
 * /sellers/me/orders. SellerOrderApiTest still covers that older endpoint; this
 * covers the versioned one, which is the one the app uses.
 *
 * Every seller, buyer and sku here carries a random suffix. The container is shared
 * across the class and rows are never cleaned up between methods, so a fixture that
 * reused an email or counted rows globally would fail on whichever test happened to
 * run second - the ordering fragility the pre-existing failures on main were made of.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SellerOrderRowApiTest {

    private static final String TEST_PHONE = "+15551234567";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private SessionRepository sessionRepository;

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
    private JdbcTemplate jdbcTemplate;

    // ------------------------------------------------------------------ list

    @Test
    void listReturnsTheContractsPageShapeForThisSellersOwnOrdersOnly() throws Exception {
        Seller me = seller();
        Seller other = seller();
        Cookie cookie = sellerCookie(me);
        BuyerIdentity buyer = buyer();

        Order mine = orderWithOneLine(me, buyer, new BigDecimal("25.00"), 2);
        orderWithOneLine(other, buyer, new BigDecimal("99.00"), 1);

        mockMvc.perform(get("/api/v1/sellers/me/orders").cookie(cookie))
                .andExpect(status().isOk())
                // The contract's four fields, not Spring's serialised Page: a client
                // reading `page` off that shape gets undefined and prints "Page NaN".
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(mine.getId().toString()))
                .andExpect(jsonPath("$.content[0].reference").value("ord_" + shortId(mine.getId())))
                .andExpect(jsonPath("$.content[0].recipientName").value("Test Buyer"))
                .andExpect(jsonPath("$.content[0].buyerEmail").value(buyer.getEmail()))
                .andExpect(jsonPath("$.content[0].status").value("PLACED"))
                .andExpect(jsonPath("$.content[0].itemCount").value(2))
                .andExpect(jsonPath("$.content[0].total").value(50.00))
                .andExpect(jsonPath("$.content[0].currency").value("USD"))
                .andExpect(jsonPath("$.content[0].destination").value("Springfield, US"))
                .andExpect(jsonPath("$.content[0].hasOpenRefund").value(false));
    }

    @Test
    void aSellerOnlySeesTheirOwnShareOfAnOrderSharedWithAnotherSeller() throws Exception {
        Seller me = seller();
        Seller other = seller();
        Cookie cookie = sellerCookie(me);
        BuyerIdentity buyer = buyer();

        Order order = bareOrder(buyer);
        line(order, me, new BigDecimal("10.00"), 1);
        line(order, other, new BigDecimal("500.00"), 3);

        mockMvc.perform(get("/api/v1/sellers/me/orders").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                // Their own line, not the order's: 10.00 and one item, never 1510.00.
                .andExpect(jsonPath("$.content[0].total").value(10.00))
                .andExpect(jsonPath("$.content[0].itemCount").value(1));

        mockMvc.perform(get("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines.length()").value(1))
                .andExpect(jsonPath("$.subtotal").value(10.00))
                .andExpect(jsonPath("$.total").value(10.00));
    }

    @Test
    void groupStatusAndSearchAllNarrowTheList() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        BuyerIdentity buyer = buyer();

        Order toPack = orderWithOneLine(me, buyer, new BigDecimal("10.00"), 1);
        Order packed = orderWithOneLine(me, buyer, new BigDecimal("20.00"), 1);
        packed.setStatus(OrderStatus.PACKED);
        orderRepository.save(packed);

        mockMvc.perform(get("/api/v1/sellers/me/orders").param("group", "to_pack").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(toPack.getId().toString()));

        mockMvc.perform(get("/api/v1/sellers/me/orders").param("group", "ready_for_pickup").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(packed.getId().toString()));

        // The finer filter the dashboard deep-links with.
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("status", "PACKED").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(packed.getId().toString()));

        // By reference, which is derived from the id rather than stored - a substring
        // of it has to match, because that is what a seller pastes.
        mockMvc.perform(get("/api/v1/sellers/me/orders")
                        .param("q", shortId(packed.getId()).substring(0, 6)).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(packed.getId().toString()));

        // By buyer email, and by recipient name.
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("q", buyer.getEmail()).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("q", "test buy").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        // A term nobody typed matches nothing rather than everything.
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("q", "no-such-buyer").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                // Still page 1 of 1: a pager printing "of 0" has no page to walk to.
                .andExpect(jsonPath("$.totalPages").value(1));
    }

    @Test
    void anUnknownGroupIs422AndAnUnknownSortFallsBackToNewest() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        BuyerIdentity buyer = buyer();
        orderWithOneLine(me, buyer, new BigDecimal("10.00"), 1);

        mockMvc.perform(get("/api/v1/sellers/me/orders").param("group", "in_a_van").cookie(cookie))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("group"));

        // A sort is a presentation choice: a stale bookmark carrying a retired one
        // should still show the seller their orders.
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("sort", "alphabetically").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1));
    }

    @Test
    void sortAndPaginationHonourTheContractsVocabulary() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        BuyerIdentity buyer = buyer();

        Order cheapOldest = orderWithOneLine(me, buyer, new BigDecimal("5.00"), 1);
        Order dearest = orderWithOneLine(me, buyer, new BigDecimal("300.00"), 1);
        Order newest = orderWithOneLine(me, buyer, new BigDecimal("50.00"), 1);
        // placed_at defaults to now() and three inserts in one millisecond would make
        // "newest" a coin toss, so the window is set explicitly.
        backdate(cheapOldest, 3);
        backdate(dearest, 2);
        backdate(newest, 1);

        mockMvc.perform(get("/api/v1/sellers/me/orders").param("sort", "newest").cookie(cookie))
                .andExpect(jsonPath("$.content[0].id").value(newest.getId().toString()));
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("sort", "oldest").cookie(cookie))
                .andExpect(jsonPath("$.content[0].id").value(cheapOldest.getId().toString()));
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("sort", "total_desc").cookie(cookie))
                .andExpect(jsonPath("$.content[0].total").value(300.00));
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("sort", "total_asc").cookie(cookie))
                .andExpect(jsonPath("$.content[0].total").value(5.00));

        mockMvc.perform(get("/api/v1/sellers/me/orders")
                        .param("sort", "oldest").param("page", "1").param("size", "2").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(newest.getId().toString()));

        // ?page=-1 used to walk backwards off the list.
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("page", "-1").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0));
    }

    @Test
    void productIdNarrowsTheQueueToOrdersContainingThatProduct() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        BuyerIdentity buyer = buyer();

        Product wanted = product(me, "Trail Backpack");
        Order withIt = bareOrder(buyer);
        lineForProduct(withIt, me, wanted, new BigDecimal("40.00"), 1);
        orderWithOneLine(me, buyer, new BigDecimal("10.00"), 1);

        mockMvc.perform(get("/api/v1/sellers/me/orders")
                        .param("productId", wanted.getId().toString()).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(withIt.getId().toString()));
    }

    // ---------------------------------------------------------------- facets

    @Test
    void facetsCountEveryBucketAndAreNotNarrowedByTheTabBeingViewed() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        BuyerIdentity buyer = buyer();

        orderWithOneLine(me, buyer, new BigDecimal("10.00"), 1);
        Order packed = orderWithOneLine(me, buyer, new BigDecimal("10.00"), 1);
        packed.setStatus(OrderStatus.PACKED);
        orderRepository.save(packed);
        Order delivered = orderWithOneLine(me, buyer, new BigDecimal("10.00"), 1);
        delivered.setStatus(OrderStatus.DELIVERED);
        orderRepository.save(delivered);

        mockMvc.perform(get("/api/v1/sellers/me/orders/facets").cookie(cookie))
                .andExpect(status().isOk())
                // Six tabs, in the order the strip prints them, every one present even
                // at zero: a tab that vanishes when empty is a tab you cannot click.
                .andExpect(jsonPath("$.facets.length()").value(6))
                .andExpect(jsonPath("$.facets[0].key").value("all"))
                .andExpect(jsonPath("$.facets[0].count").value(3))
                .andExpect(jsonPath("$.facets[1].key").value("to_pack"))
                .andExpect(jsonPath("$.facets[1].count").value(1))
                .andExpect(jsonPath("$.facets[2].key").value("ready_for_pickup"))
                .andExpect(jsonPath("$.facets[2].count").value(1))
                .andExpect(jsonPath("$.facets[3].key").value("with_amezo"))
                .andExpect(jsonPath("$.facets[3].count").value(0))
                .andExpect(jsonPath("$.facets[4].key").value("delivered"))
                .andExpect(jsonPath("$.facets[4].count").value(1))
                .andExpect(jsonPath("$.facets[5].key").value("refunded"))
                .andExpect(jsonPath("$.facets[5].count").value(0));

        // The search does narrow them - the strip describes what the search found.
        mockMvc.perform(get("/api/v1/sellers/me/orders/facets")
                        .param("q", shortId(packed.getId())).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.facets[0].count").value(1))
                .andExpect(jsonPath("$.facets[2].count").value(1));
    }

    // ---------------------------------------------------------------- detail

    @Test
    void detailResolvesTitleLabelSkuAndSlugAndSaysNothingIsAddedOnTop() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        BuyerIdentity buyer = buyer();

        Product product = product(me, "Trail Backpack");
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Blue / M").sku("SKU-" + UUID.randomUUID()).build());
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("89.99")).stockQty(5).build());

        Order order = bareOrder(buyer);
        orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(offer.getId())
                .productIdSnapshot(product.getId())
                .variantIdSnapshot(variant.getId())
                .sellerIdSnapshot(me.getId())
                .unitPriceSnapshot(new BigDecimal("89.99"))
                .quantity(2)
                .build());

        mockMvc.perform(get("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].productTitle").value("Trail Backpack"))
                .andExpect(jsonPath("$.lines[0].variantLabel").value("Blue / M"))
                .andExpect(jsonPath("$.lines[0].sku").value(variant.getSku()))
                .andExpect(jsonPath("$.lines[0].productRef").value(product.getSlug()))
                .andExpect(jsonPath("$.lines[0].lineTotal").value(179.98))
                .andExpect(jsonPath("$.subtotal").value(179.98))
                // Zero, not null and not invented: there is no rate table, no nexus and
                // no carrier price anywhere in this schema.
                .andExpect(jsonPath("$.shipping").value(0))
                .andExpect(jsonPath("$.tax").value(0))
                .andExpect(jsonPath("$.total").value(179.98))
                .andExpect(jsonPath("$.shippingAddress.city").value("Springfield"))
                .andExpect(jsonPath("$.shippingAddress.country").value("US"))
                // Nothing has shipped, so there is no shipment panel to draw.
                .andExpect(jsonPath("$.shipment").doesNotExist())
                .andExpect(jsonPath("$.packedAt").doesNotExist())
                .andExpect(jsonPath("$.refundRequests.length()").value(0));
    }

    @Test
    void anotherSellersOrderIs404AndNotA403() throws Exception {
        Seller me = seller();
        Seller owner = seller();
        Cookie cookie = sellerCookie(me);
        Order theirs = orderWithOneLine(owner, buyer(), new BigDecimal("10.00"), 1);

        // 404 on purpose: a 403 would confirm the order exists to someone with no
        // business knowing it does.
        mockMvc.perform(get("/api/v1/sellers/me/orders/{id}", theirs.getId()).cookie(cookie))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", theirs.getId()).cookie(cookie)
                        .contentType("application/json").content("{\"status\":\"PACKED\"}"))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------ transitions

    @Test
    void packingThenHandingOverAdvancesTheOrderAndIssuesATrackingNumber() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        Order order = orderWithOneLine(me, buyer(), new BigDecimal("10.00"), 1);

        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json")
                        .content("{\"status\":\"PACKED\",\"parcels\":2,\"packedBy\":\"Ada\",\"note\":\"Two boxes\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PACKED"))
                .andExpect(jsonPath("$.parcels").value(2))
                .andExpect(jsonPath("$.packedAt").exists())
                // Packing is not shipping: no tracking number yet.
                .andExpect(jsonPath("$.shipment").doesNotExist());

        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json")
                        .content("{\"status\":\"SHIPPED\",\"handoverMethod\":\"HUB_DROPOFF\","
                                + "\"hub\":\"Karachi hub\",\"note\":\"Left at the counter\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SHIPPED"))
                .andExpect(jsonPath("$.shipment.shippedAt").exists())
                // Issued by the platform on handover, never typed by the seller - the
                // PATCH has no trackingNumber field to send.
                .andExpect(jsonPath("$.shipment.trackingNumber").value(org.hamcrest.Matchers.startsWith("AMZ")))
                .andExpect(jsonPath("$.shipment.deliveryNote").value("Left at the counter"))
                // No carrier to name and no tracking page that would resolve.
                .andExpect(jsonPath("$.shipment.carrier").doesNotExist())
                .andExpect(jsonPath("$.shipment.trackingUrl").doesNotExist())
                // The packing facts survive the handover.
                .andExpect(jsonPath("$.parcels").value(2));

        Order reloaded = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(OrderStatus.SHIPPED);
        assertThat(reloaded.getTrackingNumber()).startsWith("AMZ");
        assertThat(reloaded.getShippedAt()).isNotNull();
        assertThat(reloaded.getPackedAt()).isNotNull();
    }

    @Test
    void markingAnOrderDeliveredRecordsWhenItArrived() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        Order order = orderWithOneLine(me, buyer(), new BigDecimal("10.00"), 1);

        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json").content("{\"status\":\"SHIPPED\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json")
                        .content("{\"status\":\"DELIVERED\",\"note\":\"Left with the neighbour\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DELIVERED"))
                // A real date, from somebody saying so at a particular moment - not
                // inferred from the status, which is what made this null before V26.
                .andExpect(jsonPath("$.shipment.deliveredAt").exists())
                // The handover facts survive it.
                .andExpect(jsonPath("$.shipment.shippedAt").exists())
                .andExpect(jsonPath("$.shipment.trackingNumber").value(
                        org.hamcrest.Matchers.startsWith("AMZ")));

        assertThat(orderRepository.findById(order.getId()).orElseThrow().getDeliveredAt()).isNotNull();

        // And it is filed under Delivered by the tabs and by the list they open.
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("group", "delivered").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(order.getId().toString()));
    }

    @Test
    void anOrderCanBeMarkedDeliveredFromPackedWithoutARecordedHandover() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        Order order = orderWithOneLine(me, buyer(), new BigDecimal("10.00"), 1);

        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json").content("{\"status\":\"PACKED\",\"parcels\":1}"))
                .andExpect(status().isOk());

        // Refusing this would only teach a seller to file a handover they never made.
        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json").content("{\"status\":\"DELIVERED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DELIVERED"));
    }

    @Test
    void anOrderNobodyHasPackedCannotBeDelivered() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        Order order = orderWithOneLine(me, buyer(), new BigDecimal("10.00"), 1);

        // Straight from PLACED: it has not left the shelf, so it has not arrived.
        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json").content("{\"status\":\"DELIVERED\"}"))
                .andExpect(status().isConflict());

        assertThat(orderRepository.findById(order.getId()).orElseThrow().getStatus())
                .isEqualTo(OrderStatus.PLACED);
    }

    @Test
    void anIllegalTransitionIs409AndLeavesTheOrderAlone() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        Order order = orderWithOneLine(me, buyer(), new BigDecimal("10.00"), 1);
        order.setStatus(OrderStatus.SHIPPED);
        orderRepository.save(order);

        // 409 rather than 422: the request is well-formed and the seller may make this
        // kind of move - it is the order's state that refuses it.
        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json").content("{\"status\":\"PACKED\"}"))
                .andExpect(status().isConflict());

        assertThat(orderRepository.findById(order.getId()).orElseThrow().getStatus())
                .isEqualTo(OrderStatus.SHIPPED);
    }

    @Test
    void aBackdatedTransitionIsKeptAndAFutureOneIsRefused() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        Order order = orderWithOneLine(me, buyer(), new BigDecimal("10.00"), 1);

        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json")
                        .content("{\"status\":\"PACKED\",\"occurredAt\":\"2099-01-01T00:00:00Z\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("occurredAt"));

        // Yesterday's handover, recorded today, is the whole point of the field.
        String yesterday = Instant.now().minus(1, ChronoUnit.DAYS).toString();
        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json")
                        .content("{\"status\":\"PACKED\",\"occurredAt\":\"" + yesterday + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.packedAt").exists());

        assertThat(orderRepository.findById(order.getId()).orElseThrow().getPackedAt())
                .isBefore(Instant.now().minus(23, ChronoUnit.HOURS));
    }

    @Test
    void cancellingAnOrderThatHasNotShippedPutsTheStockBack() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);

        Product product = product(me, "Cancellable");
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("One size").sku("SKU-" + UUID.randomUUID()).build());
        // 8 left after a checkout took 2 of the original 10.
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("15.00")).stockQty(8).build());

        Order order = bareOrder(buyer());
        orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(offer.getId())
                .productIdSnapshot(product.getId())
                .variantIdSnapshot(variant.getId())
                .sellerIdSnapshot(me.getId())
                .unitPriceSnapshot(new BigDecimal("15.00"))
                .quantity(2)
                .build());

        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json")
                        .content("{\"status\":\"CANCELLED\",\"note\":\"Out of stock after all\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        assertThat(offerRepository.findById(offer.getId()).orElseThrow().getStockQty()).isEqualTo(10);
        assertThat(orderRepository.findById(order.getId()).orElseThrow().getCancelledAt()).isNotNull();

        // Cancelled orders are reachable through All and ?status=, not through any of
        // the five fulfilment tabs - the design has no Cancelled tab to file them in.
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("status", "CANCELLED").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1));
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("group", "to_pack").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0));
    }

    @Test
    void cancellingAShippedOrderIsRefused() throws Exception {
        Seller me = seller();
        Cookie cookie = sellerCookie(me);
        Order order = orderWithOneLine(me, buyer(), new BigDecimal("10.00"), 1);
        order.setStatus(OrderStatus.SHIPPED);
        orderRepository.save(order);

        // Once a parcel is out, stopping it is a return, which is what the refund flow
        // is for.
        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json").content("{\"status\":\"CANCELLED\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void cancellingAnOrderSharedWithAnotherSellerIsRefused() throws Exception {
        Seller me = seller();
        Seller other = seller();
        Cookie cookie = sellerCookie(me);

        Order order = bareOrder(buyer());
        line(order, me, new BigDecimal("10.00"), 1);
        line(order, other, new BigDecimal("20.00"), 1);

        // orders.status is one column for the whole order, so cancelling it would end
        // the other seller's sale and put back stock they still owe. Refused outright
        // rather than silently doing it to them.
        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(cookie)
                        .contentType("application/json").content("{\"status\":\"CANCELLED\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Cannot cancel a shared order"));

        assertThat(orderRepository.findById(order.getId()).orElseThrow().getStatus())
                .isEqualTo(OrderStatus.PLACED);
    }

    // ---------------------------------------------------------------- refunds

    @Test
    void anOpenRefundFlagsTheRowAndASettledOneDerivesTheRefundedStatus() throws Exception {
        Seller me = seller();
        Cookie sellerCookie = sellerCookie(me);
        BuyerIdentity buyer = buyer();
        Cookie buyerCookie = buyerCookie(buyer);

        Product product = product(me, "Refundable");
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("One size").sku("SKU-" + UUID.randomUUID()).build());
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(new BigDecimal("30.00")).stockQty(5).build());

        Order order = bareOrder(buyer);
        OrderLine orderLine = orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(offer.getId())
                .productIdSnapshot(product.getId())
                .variantIdSnapshot(variant.getId())
                .sellerIdSnapshot(me.getId())
                .unitPriceSnapshot(new BigDecimal("30.00"))
                .quantity(1)
                .build());

        String refundId = jsonId(mockMvc.perform(post("/api/v1/refund-requests").cookie(buyerCookie)
                        .contentType("application/json")
                        .content("{\"orderId\":\"" + order.getId() + "\",\"lines\":[{\"orderLineId\":\""
                                + orderLine.getId() + "\",\"quantity\":1}],\"resolution\":\"REFUND\","
                                + "\"payout\":\"ORIGINAL_PAYMENT\",\"detail\":\"It arrived with a cracked case\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());

        // Live request: the row carries the pill, and the order stays in the
        // fulfilment bucket it is actually in.
        mockMvc.perform(get("/api/v1/sellers/me/orders").cookie(sellerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].hasOpenRefund").value(true))
                .andExpect(jsonPath("$.content[0].status").value("PLACED"));
        mockMvc.perform(get("/api/v1/sellers/me/orders/facets").cookie(sellerCookie))
                .andExpect(jsonPath("$.facets[1].count").value(1))
                .andExpect(jsonPath("$.facets[5].count").value(0));

        // The drawer lists it, with the items string the order assembles - the product
        // titles live in the catalogue, so the refund row has nothing to build it from.
        mockMvc.perform(get("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(sellerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refundRequests.length()").value(1))
                .andExpect(jsonPath("$.refundRequests[0].status").value("REQUESTED"))
                .andExpect(jsonPath("$.refundRequests[0].items").value("1 x Refundable"))
                .andExpect(jsonPath("$.refundRequests[0].orderReference")
                        .value("ord_" + shortId(order.getId())));

        // A refund already being settled owns the money and the return, so the order
        // cannot also be cancelled out from under it.
        mockMvc.perform(patch("/api/v1/sellers/me/orders/{id}", order.getId()).cookie(sellerCookie)
                        .contentType("application/json").content("{\"status\":\"CANCELLED\"}"))
                .andExpect(status().isConflict());

        settle(refundId, sellerCookie, "APPROVED");
        settle(refundId, sellerCookie, "RETURN_RECEIVED");
        settle(refundId, sellerCookie, "REFUNDED");

        // Derived, never stored: the stored status is still PLACED.
        mockMvc.perform(get("/api/v1/sellers/me/orders").cookie(sellerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].status").value("REFUNDED"))
                .andExpect(jsonPath("$.content[0].hasOpenRefund").value(false));
        assertThat(orderRepository.findById(order.getId()).orElseThrow().getStatus())
                .isEqualTo(OrderStatus.PLACED);

        // And it is filed under Refunded rather than To pack, by the facets and by the
        // list they open - one expression, so a tab's count cannot disagree with it.
        mockMvc.perform(get("/api/v1/sellers/me/orders/facets").cookie(sellerCookie))
                .andExpect(jsonPath("$.facets[1].count").value(0))
                .andExpect(jsonPath("$.facets[5].count").value(1));
        mockMvc.perform(get("/api/v1/sellers/me/orders").param("group", "refunded").cookie(sellerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(order.getId().toString()));
    }

    // --------------------------------------------------------------- fixtures

    private void settle(String refundId, Cookie sellerCookie, String status) throws Exception {
        mockMvc.perform(patch("/api/v1/refund-requests/{id}", refundId).cookie(sellerCookie)
                        .contentType("application/json").content("{\"status\":\"" + status + "\"}"))
                .andExpect(status().isOk());
    }

    /** The id out of a refund response, without pulling in a JSON library for one field. */
    private static String jsonId(String body) {
        int start = body.indexOf("\"id\":\"") + 6;
        return body.substring(start, body.indexOf('"', start));
    }

    private static String shortId(UUID id) {
        return id.toString().substring(0, 8);
    }

    /**
     * Moves an order back in time so "newest first" is a fact and not a coin toss -
     * three inserts inside one millisecond all share a placed_at.
     *
     * Through JdbcTemplate because Order.placedAt is @CreationTimestamp with
     * {@code updatable = false}: Hibernate leaves it out of every UPDATE it writes, so
     * a setter here would silently do nothing and the assertion below it would be
     * testing insertion order.
     */
    private void backdate(Order order, int days) {
        jdbcTemplate.update(
                "UPDATE orders SET placed_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(days, ChronoUnit.DAYS)),
                order.getId());
    }

    private Order orderWithOneLine(Seller seller, BuyerIdentity buyer, BigDecimal unitPrice, int quantity) {
        Order order = bareOrder(buyer);
        line(order, seller, unitPrice, quantity);
        return order;
    }

    private Order bareOrder(BuyerIdentity buyer) {
        return orderRepository.save(Order.builder()
                .buyerIdentityId(buyer.getId())
                .buyerEmailSnapshot(buyer.getEmail())
                .status(OrderStatus.PLACED)
                .buyerPhone(TEST_PHONE)
                .shippingAddress(address())
                .billingAddress(address())
                .build());
    }

    private void line(Order order, Seller seller, BigDecimal unitPrice, int quantity) {
        lineForProduct(order, seller, product(seller, "Test Product"), unitPrice, quantity);
    }

    /**
     * order_line.offer_id is a real FK (V10), unlike the deliberately unconstrained
     * product/variant snapshots, so every line needs a real offer behind it.
     */
    private void lineForProduct(
            Order order, Seller seller, Product product, BigDecimal unitPrice, int quantity) {
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Test Variant").sku("SKU-" + UUID.randomUUID()).build());
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId()).price(unitPrice).stockQty(0).build());
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

    private Product product(Seller seller, String title) {
        return productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title(title)
                .categoryId(Fixtures.categoryId(categoryRepository, "test"))
                .slug(Fixtures.uniqueSlug("fixture"))
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

    private Seller seller() {
        return sellerRepository.save(Seller.builder().email("rows-" + UUID.randomUUID() + "@example.com").build());
    }

    private BuyerIdentity buyer() {
        return buyerIdentityRepository.save(BuyerIdentity.builder()
                .email("rows-buyer-" + UUID.randomUUID() + "@example.com").fullName("Test Buyer").build());
    }

    private Cookie sellerCookie(Seller seller) {
        return cookieFor(IdentityType.SELLER, seller.getId());
    }

    private Cookie buyerCookie(BuyerIdentity buyer) {
        return cookieFor(IdentityType.BUYER, buyer.getId());
    }

    private Cookie cookieFor(IdentityType type, UUID identityId) {
        String rawToken = "test-session-" + UUID.randomUUID();
        sessionRepository.save(Session.builder()
                .identityType(type)
                .identityId(identityId)
                .tokenHash(sha256Hex(rawToken))
                .expiresAt(Instant.now().plus(30, ChronoUnit.DAYS))
                .build());
        return new Cookie("mp_session", rawToken);
    }

    private String sha256Hex(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
