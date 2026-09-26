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
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The seller dashboard's three reads, against a real Postgres.
 *
 * The window under test is always 2026-09-01 .. 2026-09-30 inclusive, whose
 * preceding window is therefore 2026-08-02 .. 2026-08-31. Fixed dates rather
 * than offsets from now(): a window defined relative to the clock makes a
 * boundary assertion pass or fail depending on what time the suite runs, which
 * is the one thing these tests exist to pin down.
 *
 * OrderLine.createdAt is @CreationTimestamp and updatable=false, so it cannot be
 * set through the builder - Hibernate overwrites it on insert. Every line here
 * is therefore backdated with a direct UPDATE afterwards, which is the only way
 * to place a row on a window edge at all.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SellerMetricsApiTest {

    private static final String METRICS = "/api/v1/sellers/me/metrics";
    private static final String FROM = "2026-09-01";
    private static final String TO = "2026-09-30";

    /** Satisfies orders' NOT NULL columns from V12; never asserted on. */
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

    @Test
    void totalsCountOnlyTheCallingSellersLines() throws Exception {
        Seller me = seller("metrics-me@example.com");
        Seller other = seller("metrics-other@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer1@example.com");

        UUID myProduct = product(me, "Mine", "electronics");
        UUID theirProduct = product(other, "Theirs", "electronics");

        UUID myOrder = order(buyer);
        line(myOrder, me, myProduct, "100.00", 1, "2026-09-10T12:00:00Z");
        UUID theirOrder = order(buyer);
        line(theirOrder, other, theirProduct, "500.00", 1, "2026-09-10T12:00:00Z");

        mockMvc.perform(get(METRICS).param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.totals.revenue").value(100.00))
                .andExpect(jsonPath("$.totals.orders").value(1));
    }

    /**
     * What real checkout actually writes since V12: Order.sellerId is never set,
     * and one order can hold several sellers' lines. Anything that found the
     * seller through orders.seller_id would report nothing at all here.
     */
    @Test
    void findsRevenueOnOrdersWhoseOrderLevelSellerIdIsNull() throws Exception {
        Seller me = seller("metrics-nullseller@example.com");
        Seller other = seller("metrics-nullseller-other@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer2@example.com");

        UUID shared = order(buyer);
        line(shared, me, product(me, "Mine", "electronics"), "10.00", 1, "2026-09-05T09:00:00Z");
        line(shared, other, product(other, "Theirs", "electronics"), "500.00", 1, "2026-09-05T09:00:00Z");

        // Not an incidental detail of the fixture - the assertion below only
        // means anything while this holds.
        Order saved = orderRepository.findById(shared).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(saved.getSellerId()).isNull();

        mockMvc.perform(get(METRICS).param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.revenue").value(10.00))
                .andExpect(jsonPath("$.totals.orders").value(1));
    }

    /**
     * The window is half-open on the instant, inclusive on the day: midnight
     * opening `from` is in, the last second of `to` is in, and one second either
     * side is out.
     */
    @Test
    void theWindowIncludesBothEdgeDaysWholeAndNothingOutsideThem() throws Exception {
        Seller me = seller("metrics-edges@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer3@example.com");
        UUID product = product(me, "Edge", "electronics");

        UUID onFrom = order(buyer);
        line(onFrom, me, product, "1.00", 1, "2026-09-01T00:00:00Z");
        UUID onTo = order(buyer);
        line(onTo, me, product, "2.00", 1, "2026-09-30T23:59:59Z");
        UUID dayBefore = order(buyer);
        line(dayBefore, me, product, "400.00", 1, "2026-08-31T23:59:59Z");
        UUID dayAfter = order(buyer);
        line(dayAfter, me, product, "800.00", 1, "2026-10-01T00:00:00Z");

        mockMvc.perform(get(METRICS).param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                // 1.00 + 2.00 only. Either excluded row is 100x larger, so a
                // boundary that slipped by a day could not hide in a rounding.
                .andExpect(jsonPath("$.totals.revenue").value(3.00))
                .andExpect(jsonPath("$.totals.orders").value(2))
                .andExpect(jsonPath("$.series.length()").value(30))
                .andExpect(jsonPath("$.series[0].date").value("2026-09-01"))
                .andExpect(jsonPath("$.series[0].revenue").value(1.00))
                .andExpect(jsonPath("$.series[29].date").value("2026-09-30"))
                .andExpect(jsonPath("$.series[29].revenue").value(2.00))
                // The quiet days are present and zero, not missing: a chart drawn
                // from the measured rows alone would join 1 Sep straight to 30 Sep.
                .andExpect(jsonPath("$.series[10].revenue").value(0))
                .andExpect(jsonPath("$.series[10].orders").value(0));
    }

    /**
     * The distinction the whole comparison rests on. A seller with no line at
     * all in the previous window gets null - nothing was measured there - and it
     * is never a zeroed MetricTotals, which would claim a measurement nobody
     * took.
     */
    @Test
    void previousTotalsIsNullWhenThePreviousWindowHoldsNoLineAtAll() throws Exception {
        Seller me = seller("metrics-noprev@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer4@example.com");

        UUID order = order(buyer);
        line(order, me, product(me, "Only now", "electronics"), "75.00", 1, "2026-09-12T12:00:00Z");

        mockMvc.perform(get(METRICS).param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.revenue").value(75.00))
                .andExpect(jsonPath("$.previousTotals").doesNotExist());
    }

    @Test
    void previousTotalsIsMeasuredWhenThePreviousWindowHasLines() throws Exception {
        Seller me = seller("metrics-withprev@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer5@example.com");
        UUID product = product(me, "Both windows", "electronics");

        UUID now = order(buyer);
        line(now, me, product, "75.00", 1, "2026-09-12T12:00:00Z");
        // Inside 2026-08-02 .. 2026-08-31, the window immediately before.
        UUID then = order(buyer);
        line(then, me, product, "25.00", 1, "2026-08-20T12:00:00Z");
        // Just outside the previous window's own start, so the previous window is
        // pinned at both ends rather than only at the near one.
        UUID tooOld = order(buyer);
        line(tooOld, me, product, "900.00", 1, "2026-08-01T23:59:59Z");

        mockMvc.perform(get(METRICS).param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.previousTotals.revenue").value(25.00))
                .andExpect(jsonPath("$.previousTotals.orders").value(1));
    }

    /**
     * views and conversionRate have no data source anywhere in this schema - no
     * view, impression or visit is recorded. They are present and null, never a
     * zero or an estimate. If this ever starts failing, something has invented a
     * number.
     */
    @Test
    void viewsAndConversionRateAreNullBecauseNothingRecordsAView() throws Exception {
        Seller me = seller("metrics-noviews@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer6@example.com");

        UUID order = order(buyer);
        line(order, me, product(me, "Sold", "electronics"), "10.00", 1, "2026-09-12T12:00:00Z");

        mockMvc.perform(get(METRICS).param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.views").doesNotExist())
                .andExpect(jsonPath("$.totals.conversionRate").doesNotExist())
                .andExpect(jsonPath("$.series[11].views").doesNotExist())
                // The figures that DO have a source are still there.
                .andExpect(jsonPath("$.totals.averageOrderValue").value(10.00));
    }

    /**
     * The same null-versus-zero rule, per product. One product did not sell in
     * the previous window (null); another sold at a price of zero (0.00). A
     * COALESCE anywhere in that LEFT JOIN collapses the two.
     */
    @Test
    void topProductsPreviousRevenueIsNullWhenAbsentAndZeroWhenMeasured() throws Exception {
        Seller me = seller("metrics-topprev@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer7@example.com");

        UUID absent = product(me, "Did not sell before", "electronics");
        UUID free = product(me, "Sold for nothing before", "electronics");

        UUID now = order(buyer);
        line(now, me, absent, "60.00", 1, "2026-09-12T12:00:00Z");
        line(now, me, free, "40.00", 1, "2026-09-12T12:00:00Z");

        UUID then = order(buyer);
        line(then, me, free, "0.00", 1, "2026-08-20T12:00:00Z");

        mockMvc.perform(get(METRICS + "/top-products")
                        .param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].title").value("Did not sell before"))
                .andExpect(jsonPath("$[0].revenue").value(60.00))
                .andExpect(jsonPath("$[0].previousRevenue").doesNotExist())
                .andExpect(jsonPath("$[1].title").value("Sold for nothing before"))
                .andExpect(jsonPath("$[1].previousRevenue").value(0.00));
    }

    @Test
    void topProductsCarryTheSlugShareAndUnitsAndExcludeOtherSellers() throws Exception {
        Seller me = seller("metrics-topshape@example.com");
        Seller other = seller("metrics-topshape-other@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer8@example.com");

        UUID mine = product(me, "Aurora One", "electronics");
        UUID theirs = product(other, "Not yours", "electronics");

        UUID order = order(buyer);
        line(order, me, mine, "30.00", 3, "2026-09-12T12:00:00Z");
        line(order, me, product(me, "Aurora Case", "electronics"), "10.00", 1, "2026-09-12T12:00:00Z");
        line(order, other, theirs, "900.00", 1, "2026-09-12T12:00:00Z");

        mockMvc.perform(get(METRICS + "/top-products")
                        .param("from", FROM).param("to", TO).param("limit", "5").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].title").value("Aurora One"))
                .andExpect(jsonPath("$[0].productRef").value(slugOf(mine)))
                .andExpect(jsonPath("$[0].units").value(3))
                .andExpect(jsonPath("$[0].revenue").value(90.00))
                // 90 of the seller's own 100 in the window - the denominator is
                // the whole window, not the rows returned.
                .andExpect(jsonPath("$[0].share").value(0.9))
                .andExpect(jsonPath("$[0].thumbnailUrl").doesNotExist());
    }

    @Test
    void topProductsRespectsLimit() throws Exception {
        Seller me = seller("metrics-limit@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer9@example.com");
        UUID order = order(buyer);

        for (int i = 0; i < 4; i++) {
            line(order, me, product(me, "P" + i, "electronics"), (10 + i) + ".00", 1, "2026-09-12T12:00:00Z");
        }

        mockMvc.perform(get(METRICS + "/top-products")
                        .param("from", FROM).param("to", TO).param("limit", "2").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].revenue").value(13.00))
                .andExpect(jsonPath("$[1].revenue").value(12.00));
    }

    @Test
    void categoryBreakdownGroupsTheWindowsRevenueByCategoryAndExcludesOtherSellers() throws Exception {
        Seller me = seller("metrics-cats@example.com");
        Seller other = seller("metrics-cats-other@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer10@example.com");

        UUID order = order(buyer);
        line(order, me, product(me, "Headphones", "electronics"), "60.00", 1, "2026-09-12T12:00:00Z");
        line(order, me, product(me, "Speaker", "electronics"), "15.00", 2, "2026-09-12T12:00:00Z");
        line(order, me, product(me, "T-shirt", "apparel"), "10.00", 1, "2026-09-12T12:00:00Z");
        line(order, other, product(other, "Theirs", "apparel"), "900.00", 1, "2026-09-12T12:00:00Z");
        // Outside the window entirely.
        UUID old = order(buyer);
        line(old, me, product(me, "Old kettle", "kitchen"), "700.00", 1, "2026-07-01T12:00:00Z");

        mockMvc.perform(get(METRICS + "/category-breakdown")
                        .param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].category.slug").value("electronics"))
                .andExpect(jsonPath("$[0].category.name").value("Electronics"))
                .andExpect(jsonPath("$[0].revenue").value(90.00))
                .andExpect(jsonPath("$[0].units").value(3))
                .andExpect(jsonPath("$[0].share").value(0.9))
                .andExpect(jsonPath("$[1].category.slug").value("apparel"))
                .andExpect(jsonPath("$[1].revenue").value(10.00));
    }

    @Test
    void anEmptyWindowIsZeroTotalsAnEmptySeriesAndEmptyLists() throws Exception {
        Seller me = seller("metrics-empty@example.com");
        Cookie cookie = sessionCookieFor(me);

        mockMvc.perform(get(METRICS).param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.revenue").value(0))
                .andExpect(jsonPath("$.totals.orders").value(0))
                .andExpect(jsonPath("$.totals.averageOrderValue").value(0))
                // No sales anywhere means the previous window measured nothing
                // either, which is null rather than a row of zeroes.
                .andExpect(jsonPath("$.previousTotals").doesNotExist())
                // The series is still the full window - an empty month is a
                // flat chart, not a missing one.
                .andExpect(jsonPath("$.series.length()").value(30));

        mockMvc.perform(get(METRICS + "/top-products")
                        .param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get(METRICS + "/category-breakdown")
                        .param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /**
     * The route is under /api/v1, which SecurityConfig's "/sellers/me/**" rule
     * does not match - it needs its own. Without it every call here would 403
     * from anyRequest().denyAll() no matter how correct the controller was.
     */
    @Test
    void metricsRequireASellerSession() throws Exception {
        mockMvc.perform(get(METRICS).param("from", FROM).param("to", TO))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get(METRICS + "/top-products").param("from", FROM).param("to", TO))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get(METRICS + "/category-breakdown").param("from", FROM).param("to", TO))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aBuyerSessionCannotReadSellerMetrics() throws Exception {
        BuyerIdentity buyer = buyer("metrics-buyer-role@example.com");
        Cookie cookie = Fixtures.sessionCookie(sessionRepository, IdentityType.BUYER, buyer.getId());

        mockMvc.perform(get(METRICS).param("from", FROM).param("to", TO).cookie(cookie))
                .andExpect(status().isForbidden());
    }

    @Test
    void weeklyBucketsStartOnMondayAndCoverTheWholeWindow() throws Exception {
        Seller me = seller("metrics-weekly@example.com");
        Cookie cookie = sessionCookieFor(me);
        BuyerIdentity buyer = buyer("metrics-buyer11@example.com");

        UUID order = order(buyer);
        line(order, me, product(me, "Weekly", "electronics"), "50.00", 1, "2026-09-01T12:00:00Z");

        mockMvc.perform(get(METRICS)
                        .param("from", FROM).param("to", TO).param("interval", "week").cookie(cookie))
                .andExpect(status().isOk())
                // 1 Sep 2026 is a Tuesday, so its ISO week opens on 31 Aug - the
                // first bucket legitimately starts before `from`, and the Java
                // side has to agree with Postgres' date_trunc about that or the
                // measured row lands in no bucket at all.
                .andExpect(jsonPath("$.series[0].date").value("2026-08-31"))
                .andExpect(jsonPath("$.series[0].revenue").value(50.00));
    }

    // ---------------------------------------------------------------- fixtures

    private Seller seller(String email) {
        return sellerRepository.save(Seller.builder().email(email).build());
    }

    private BuyerIdentity buyer(String email) {
        return buyerIdentityRepository.save(
                BuyerIdentity.builder().email(email).fullName("Test Buyer").build());
    }

    private Cookie sessionCookieFor(Seller seller) {
        return Fixtures.sessionCookie(sessionRepository, IdentityType.SELLER, seller.getId());
    }

    /** A product with a real category, so the breakdown has something to group by. */
    private UUID product(Seller owner, String title, String categorySlug) {
        return productRepository.save(Product.builder()
                .sellerId(owner.getId())
                .title(title)
                .categoryId(Fixtures.categoryId(categoryRepository, categorySlug))
                .slug(Fixtures.uniqueSlug(title))
                .build()).getId();
    }

    private String slugOf(UUID productId) {
        return productRepository.findById(productId).orElseThrow().getSlug();
    }

    /**
     * Order.sellerId is deliberately left unset on every fixture order here -
     * that is what real checkout writes, and scoping through it is the bug these
     * endpoints must not have.
     */
    private UUID order(BuyerIdentity buyer) {
        return orderRepository.save(Order.builder()
                .buyerIdentityId(buyer.getId())
                .buyerEmailSnapshot(buyer.getEmail())
                .status(OrderStatus.PLACED)
                .buyerPhone(TEST_PHONE)
                .shippingAddress(address())
                .billingAddress(address())
                .build()).getId();
    }

    /**
     * One line, backdated to `at`.
     *
     * The UPDATE is not avoidable: created_at is @CreationTimestamp and
     * updatable=false, so Hibernate stamps it with now() on insert and ignores
     * anything the builder was given. Every window assertion in this class
     * depends on the row actually sitting where it says it does.
     */
    private void line(UUID orderId, Seller owner, UUID productId, String unitPrice, int quantity, String at) {
        UUID lineId = orderLineRepository.save(OrderLine.builder()
                .orderId(orderId)
                .offerId(offerFor(owner, productId))
                .productIdSnapshot(productId)
                .variantIdSnapshot(UUID.randomUUID())
                .sellerIdSnapshot(owner.getId())
                .unitPriceSnapshot(new BigDecimal(unitPrice))
                .quantity(quantity)
                .build()).getId();

        jdbcTemplate.update(
                "UPDATE order_line SET created_at = ? WHERE id = ?",
                Timestamp.from(Instant.parse(at)), lineId);
    }

    /**
     * order_line.offer_id is a real foreign key (V10's comment says why), unlike
     * the deliberately unconstrained snapshot ids beside it, so every line needs
     * an offer row behind it.
     */
    private UUID offerFor(Seller owner, UUID productId) {
        Variant variant = variantRepository.save(Variant.builder()
                .productId(productId)
                .label("Default")
                .sku("SKU-" + UUID.randomUUID())
                .build());
        Offer offer = offerRepository.save(Offer.builder()
                .variantId(variant.getId())
                .price(BigDecimal.ZERO)
                .stockQty(0)
                .build());
        return offer.getId();
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
