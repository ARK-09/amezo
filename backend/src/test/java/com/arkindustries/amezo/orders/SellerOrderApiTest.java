package com.arkindustries.amezo.orders;

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
import jakarta.servlet.http.Cookie;
import com.arkindustries.amezo.catalog.CategoryRepository;
import com.arkindustries.amezo.support.Fixtures;
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
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SellerOrderApiTest {

    // Orders now require buyer_phone + full shipping/billing address (V12
    // migration, added by checkout) - these fixtures just satisfy the
    // NOT NULL columns, their actual values aren't asserted on anywhere.
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

    @Test
    void listMineOnlyReturnsTheCallingSellersOrdersWithComputedTotals() throws Exception {
        Seller me = seller("orders-me@example.com");
        Seller other = seller("orders-other@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("buyer1@example.com");

        Order mine = seedOrderWithOneLine(me.getId(), buyer.getId(), new BigDecimal("25.00"), 2);
        seedOrderWithOneLine(other.getId(), buyer.getId(), new BigDecimal("99.00"), 1);

        mockMvc.perform(get("/sellers/me/orders").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(mine.getId().toString()))
                .andExpect(jsonPath("$.content[0].total").value(50.00))
                .andExpect(jsonPath("$.content[0].buyerEmail").value("buyer1@example.com"));
    }

    @Test
    void findsAnOrderWithNoOrderLevelSellerIdSetPurelyFromTheLinesSellerSnapshot() throws Exception {
        // This is what real checkout actually creates now: Order.sellerId is
        // never set (nullable, see Order's own doc comment) - only
        // order_line.sellerIdSnapshot identifies the seller. Regression
        // guard for the bug this would otherwise NPE/silently-empty on.
        Seller me = seller("nullsellerid@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("buyer-nullsellerid@example.com");

        Order order = orderRepository.save(Order.builder()
                .buyerIdentityId(buyer.getId())
                .buyerEmailSnapshot(buyer.getEmail())
                .status(OrderStatus.PLACED)
                .buyerPhone(TEST_PHONE)
                .shippingAddress(testAddress())
                .billingAddress(testAddress())
                .build());
        orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(seedOfferId(me.getId()))
                .productIdSnapshot(UUID.randomUUID())
                .variantIdSnapshot(UUID.randomUUID())
                .sellerIdSnapshot(me.getId())
                .unitPriceSnapshot(new BigDecimal("12.00"))
                .quantity(1)
                .build());

        assertThat(order.getSellerId()).isNull();

        mockMvc.perform(get("/sellers/me/orders").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(order.getId().toString()));

        mockMvc.perform(get("/sellers/me/orders/{id}", order.getId()).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(12.00));
    }

    @Test
    void anOrderSpanningTwoSellersOnlyShowsEachSellersOwnLinesAndTotal() throws Exception {
        Seller sellerA = seller("multiA@example.com");
        Seller sellerB = seller("multiB@example.com");
        Cookie cookieA = sessionCookieFor(sellerA);
        BuyerIdentity buyer = buyer("buyer-multi@example.com");

        Order order = orderRepository.save(Order.builder()
                .buyerIdentityId(buyer.getId())
                .buyerEmailSnapshot(buyer.getEmail())
                .status(OrderStatus.PLACED)
                .buyerPhone(TEST_PHONE)
                .shippingAddress(testAddress())
                .billingAddress(testAddress())
                .build());
        orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(seedOfferId(sellerA.getId()))
                .productIdSnapshot(UUID.randomUUID())
                .variantIdSnapshot(UUID.randomUUID())
                .sellerIdSnapshot(sellerA.getId())
                .unitPriceSnapshot(new BigDecimal("10.00"))
                .quantity(1)
                .build());
        orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(seedOfferId(sellerB.getId()))
                .productIdSnapshot(UUID.randomUUID())
                .variantIdSnapshot(UUID.randomUUID())
                .sellerIdSnapshot(sellerB.getId())
                .unitPriceSnapshot(new BigDecimal("500.00"))
                .quantity(1)
                .build());

        mockMvc.perform(get("/sellers/me/orders/{id}", order.getId()).cookie(cookieA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines.length()").value(1))
                .andExpect(jsonPath("$.total").value(10.00));
    }

    @Test
    void listMineFiltersByStatus() throws Exception {
        Seller me = seller("statusfilter@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("buyer2@example.com");

        Order placed = seedOrderWithOneLine(me.getId(), buyer.getId(), new BigDecimal("10.00"), 1);
        Order shipped = seedOrderWithOneLine(me.getId(), buyer.getId(), new BigDecimal("10.00"), 1);
        shipped.setStatus(OrderStatus.SHIPPED);
        orderRepository.save(shipped);

        mockMvc.perform(get("/sellers/me/orders").param("status", "PLACED").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(placed.getId().toString()));
    }

    @Test
    void getDetailResolvesLineProductTitleAndVariantLabel() throws Exception {
        Seller me = seller("detail@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("buyer3@example.com");

        Product product = productRepository.save(
                Product.builder().sellerId(me.getId()).title("Trail Backpack").categoryId(Fixtures.categoryId(categoryRepository, "outdoor")).slug(Fixtures.uniqueSlug("fixture")).build());
        Variant variant = variantRepository.save(
                Variant.builder().productId(product.getId()).label("Blue / M").sku("SKU-D1").build());
        Offer offer = offerRepository.save(
                Offer.builder().variantId(variant.getId()).price(new BigDecimal("89.99")).stockQty(5).build());

        Order order = orderRepository.save(Order.builder()
                .buyerIdentityId(buyer.getId())
                .sellerId(me.getId())
                .buyerEmailSnapshot(buyer.getEmail())
                .status(OrderStatus.PLACED)
                .buyerPhone(TEST_PHONE)
                .shippingAddress(testAddress())
                .billingAddress(testAddress())
                .build());
        orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(offer.getId())
                .productIdSnapshot(product.getId())
                .variantIdSnapshot(variant.getId())
                .sellerIdSnapshot(me.getId())
                .unitPriceSnapshot(new BigDecimal("89.99"))
                .quantity(1)
                .build());

        mockMvc.perform(get("/sellers/me/orders/{id}", order.getId()).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].productTitle").value("Trail Backpack"))
                .andExpect(jsonPath("$.lines[0].variantLabel").value("Blue / M"))
                .andExpect(jsonPath("$.total").value(89.99));
    }

    @Test
    void gettingAnotherSellersOrderReturns404() throws Exception {
        Seller me = seller("notowner-order@example.com");
        Seller owner = seller("realowner-order@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("buyer4@example.com");

        Order order = seedOrderWithOneLine(owner.getId(), buyer.getId(), new BigDecimal("10.00"), 1);

        mockMvc.perform(get("/sellers/me/orders/{id}", order.getId()).cookie(cookie))
                .andExpect(status().isNotFound());
    }

    @Test
    void shippingAPlacedOrderSetsTrackingNumberAndShippedAt() throws Exception {
        Seller me = seller("shipper@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("buyer5@example.com");

        Order order = seedOrderWithOneLine(me.getId(), buyer.getId(), new BigDecimal("10.00"), 1);

        mockMvc.perform(post("/sellers/me/orders/{id}/ship", order.getId()).cookie(cookie)
                        .contentType("application/json")
                        .content("{\"trackingNumber\":\"TRACK123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SHIPPED"))
                .andExpect(jsonPath("$.trackingNumber").value("TRACK123"));

        Order reloaded = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(OrderStatus.SHIPPED);
        assertThat(reloaded.getTrackingNumber()).isEqualTo("TRACK123");
        assertThat(reloaded.getShippedAt()).isNotNull();
    }

    @Test
    void shippingAnAlreadyShippedOrderReturns409() throws Exception {
        Seller me = seller("doubleship@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("buyer6@example.com");

        Order order = seedOrderWithOneLine(me.getId(), buyer.getId(), new BigDecimal("10.00"), 1);
        order.setStatus(OrderStatus.SHIPPED);
        orderRepository.save(order);

        mockMvc.perform(post("/sellers/me/orders/{id}/ship", order.getId()).cookie(cookie)
                        .contentType("application/json")
                        .content("{\"trackingNumber\":\"AGAIN\"}"))
                .andExpect(status().isConflict());
    }

    private Order seedOrderWithOneLine(UUID sellerId, UUID buyerIdentityId, BigDecimal unitPrice, int quantity) {
        Order order = orderRepository.save(Order.builder()
                .buyerIdentityId(buyerIdentityId)
                .sellerId(sellerId)
                .buyerEmailSnapshot(buyerIdentityRepository.findById(buyerIdentityId).orElseThrow().getEmail())
                .status(OrderStatus.PLACED)
                .buyerPhone(TEST_PHONE)
                .shippingAddress(testAddress())
                .billingAddress(testAddress())
                .build());
        orderLineRepository.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(seedOfferId(sellerId))
                .productIdSnapshot(UUID.randomUUID())
                .variantIdSnapshot(UUID.randomUUID())
                .sellerIdSnapshot(sellerId)
                .unitPriceSnapshot(unitPrice)
                .quantity(quantity)
                .build());
        return order;
    }

    // order_line.offer_id is a real FK (see V10's migration comment) - unlike
    // productIdSnapshot/variantIdSnapshot, which are deliberately
    // unconstrained historical copies, this one needs a real offer row
    // behind it or the insert fails with a foreign-key violation.
    private UUID seedOfferId(UUID sellerId) {
        Product product = productRepository.save(
                Product.builder().sellerId(sellerId).title("Test Product").categoryId(Fixtures.categoryId(categoryRepository, "test")).slug(Fixtures.uniqueSlug("fixture")).build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("Test Variant").sku("SKU-" + UUID.randomUUID()).build());
        Offer offer = offerRepository.save(
                Offer.builder().variantId(variant.getId()).price(BigDecimal.ZERO).stockQty(0).build());
        return offer.getId();
    }

    private Address testAddress() {
        return Address.builder()
                .fullName("Test Buyer")
                .line1("1 Main St")
                .city("Springfield")
                .state("IL")
                .postalCode("62701")
                .country("US")
                .build();
    }

    private Seller seller(String email) {
        return sellerRepository.save(Seller.builder().email(email).build());
    }

    private BuyerIdentity buyer(String email) {
        return buyerIdentityRepository.save(BuyerIdentity.builder().email(email).fullName("Test Buyer").build());
    }

    private Cookie sessionCookieFor(Seller seller) {
        String rawToken = "test-session-" + UUID.randomUUID();
        sessionRepository.save(Session.builder()
                .identityType(IdentityType.SELLER)
                .identityId(seller.getId())
                .tokenHash(sha256Hex(rawToken))
                .expiresAt(Instant.now().plus(30, ChronoUnit.DAYS))
                .build());
        return new Cookie("mp_session", rawToken);
    }

    private String sha256Hex(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes());
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
