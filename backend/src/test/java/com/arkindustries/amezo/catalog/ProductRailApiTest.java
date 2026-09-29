package com.arkindustries.amezo.catalog;

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
import com.arkindustries.amezo.support.Fixtures;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
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
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The landing page's merchandising rails, as endpoints that mean what their
 * headings say.
 *
 * <h2>What was wrong</h2>
 *
 * There were no such endpoints. The landing page built every rail out of
 * {@code GET /products}: "Today's best picks" was {@code sort=relevance} with no
 * query - and relevance without a query has nothing to rank on, so the search
 * ORDER BY falls through to {@code created_at DESC}. "New this week" was the same
 * query with {@code sort=newest} and NO date bound, so the newest listing in the
 * catalog headed that rail however many months old it was. Nothing anywhere
 * consulted a sale. Three rails, one query, three headings that were true by
 * accident or not at all.
 *
 * <h2>What these tests pin</h2>
 *
 * That each rail is now computed from the thing it claims: units actually sold for
 * best-selling, and a real lower bound on listing date for new arrivals. The
 * negative cases are the load-bearing ones - a product nobody bought must not
 * appear under "best selling", and a product listed last year must not appear under
 * "new this week" - because those are exactly the ones the old recency query got
 * wrong while looking perfectly healthy.
 *
 * <h2>Why the category filter is used so much</h2>
 *
 * The rails rank the whole catalog, and this class seeds products across its own
 * methods that outlive each one. Narrowing to a category created per test makes the
 * candidate set exactly the products that test seeded, so an assertion on the full
 * ordering is stable rather than a guess about what else is in the table.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProductRailApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private SellerRepository sellers;
    @Autowired private BuyerIdentityRepository buyers;
    @Autowired private CategoryRepository categories;
    @Autowired private ProductRepository products;
    @Autowired private VariantRepository variants;
    @Autowired private OfferRepository offers;
    @Autowired private OrderRepository orders;
    @Autowired private OrderLineRepository orderLines;

    private Seller seller;
    private BuyerIdentity buyer;

    @BeforeEach
    void seedParties() {
        seller = sellers.save(Seller.builder()
                .email("rail-seller-" + UUID.randomUUID() + "@example.com").build());
        buyer = buyers.save(BuyerIdentity.builder()
                .email("rail-buyer-" + UUID.randomUUID() + "@example.com")
                .fullName("Rail Buyer")
                .build());
    }

    // ------------------------------------------------------------- best selling

    /**
     * The headline: the rail is ordered by units sold, and neither recency nor row
     * order has anything to do with it.
     *
     * <h2>Why the seeding looks so deliberate</h2>
     *
     * Both plausible wrong answers are made to be the EXACT REVERSE of the right one,
     * rather than merely different from it. The three listings are sorted by their own
     * generated ids and the sales are then assigned smallest-id-sells-least, so a query
     * that ranked by primary key produces the reverse; their listing dates are set the
     * same way round, so one that stayed {@code created_at DESC} - which is what the
     * landing page's "best picks" rail silently was - produces the reverse too.
     *
     * Asserting a specific order against ids the database invents is otherwise a one
     * in six chance of passing while broken, and this test exists precisely to catch
     * a query that has quietly stopped consulting sales. Verified by mutation: ranking
     * this by product id instead of by SUM(quantity) fails it.
     *
     * <h2>Units, not orders</h2>
     *
     * The mid-ranked product's nine units come from two separate orders and the top
     * one's twenty from a single line. "Best selling" is how much moved, which is what
     * a merchandiser means and what a per-order count gets wrong for anything bought
     * in twos.
     */
    @Test
    void theBestSellingRailIsOrderedByUnitsSoldRatherThanByListingDateOrRowOrder() throws Exception {
        String category = category("rail-units");
        List<Listing> byId = Stream.of(
                        listing(category, "First Listed"),
                        listing(category, "Second Listed"),
                        listing(category, "Third Listed"))
                .sorted(Comparator.comparing(Listing::productId))
                .toList();
        Listing slow = byId.get(0);
        Listing steady = byId.get(1);
        Listing runaway = byId.get(2);

        sell(slow, 2);
        sell(steady, 4);
        sell(steady, 5);
        sell(runaway, 20);

        // Newest first is now slow, steady, runaway - the exact reverse of the answer.
        backdateListing(steady, Duration.ofDays(2));
        backdateListing(runaway, Duration.ofDays(3));

        assertThat(railIds("/products/best-selling", "category", category))
                .containsExactly(runaway.id(), steady.id(), slow.id());
    }

    /**
     * A product nobody has bought is not a best seller.
     *
     * The assertion the old recency rail could never have passed: it ranked the
     * catalog, so an unsold product headed the "popular" rail simply by being listed
     * most recently. Nothing here pads the rail to a target length - a short rail is
     * the honest answer.
     */
    @Test
    void aProductNobodyBoughtIsAbsentFromTheBestSellingRail() throws Exception {
        String category = category("rail-unsold");
        Listing sold = listing(category, "Actually Bought");
        Listing unsold = listing(category, "Never Bought");

        sell(sold, 1);

        assertThat(railIds("/products/best-selling", "category", category))
                .containsExactly(sold.id())
                .doesNotContain(unsold.id());
    }

    /**
     * Orders ranks what SOLD; catalog decides what may be SHOWN.
     *
     * A product can sell well and then be unpublished, and orders knows nothing about
     * that - its ranking is over order_line, where the product id is a historical
     * snapshot with no foreign key to the listing. So catalog loads the ranked ids
     * and drops anything not ACTIVE, and the rail closes over the gap rather than
     * going short: the seller's own draft must not reappear on the storefront because
     * of last month's sales.
     */
    @Test
    void aBestSellerThatHasSinceBeenUnpublishedDropsOutOfTheRail() throws Exception {
        String category = category("rail-unpublished");
        Listing withdrawn = listing(category, "Withdrawn Hit");
        Listing available = listing(category, "Still Listed");

        sell(withdrawn, 50);
        sell(available, 1);

        // Ranked first on sales, and then taken off sale.
        Product product = products.findById(withdrawn.productId()).orElseThrow();
        product.setStatus(ProductStatus.DRAFT);
        products.save(product);

        assertThat(railIds("/products/best-selling", "category", category))
                .containsExactly(available.id());

        // And on the unfiltered rail, where the candidate list is not pre-filtered by
        // category and the load-by-id is the ONLY thing standing between a top seller
        // and the storefront. Asserted separately because the two paths drop it with
        // two different queries, and the category one would hide a regression in this.
        assertThat(railIds("/products/best-selling", "size", "50"))
                .doesNotContain(withdrawn.id())
                .contains(available.id());
    }

    /**
     * The window is a window: sales older than it do not count.
     *
     * Without it "best selling" means "sold well at some point since launch", which
     * is a different and much less useful claim - a product that shifted a thousand
     * units two years ago would sit at the top of a rail the storefront calls popular
     * forever. Omitting the parameter still means all of history, which is the right
     * default for a catalog too young to have a meaningful recent window.
     */
    @Test
    void theBestSellingWindowExcludesOlderSales() throws Exception {
        String category = category("rail-window");
        Listing lastYear = listing(category, "Last Year's Hit");
        Listing thisWeek = listing(category, "This Week's Modest Seller");

        sell(lastYear, 500);
        sell(thisWeek, 3);
        backdateSales(lastYear, Duration.ofDays(400));

        // Inside a month, only the recent sale exists at all.
        assertThat(railIds("/products/best-selling", "category", category, "withinDays", "30"))
                .containsExactly(thisWeek.id());

        // Over all of history the old hit is still the biggest seller there has been.
        assertThat(railIds("/products/best-selling", "category", category))
                .containsExactly(lastYear.id(), thisWeek.id());
    }

    /**
     * Unfiltered, the rail ranks the whole catalog - and still only over things that
     * sold.
     *
     * Asserted as membership rather than as an exact list because this one is not
     * narrowed to a category, so every product the other methods in this class seeded
     * is a legitimate candidate. What must hold either way: something bought is in it
     * and something unbought is not.
     */
    @Test
    void theUnfilteredRailRanksAcrossTheWholeCatalogue() throws Exception {
        Listing sold = listing(category("rail-global"), "Globally Popular");
        Listing unsold = listing(category("rail-global-unsold"), "Globally Ignored");

        sell(sold, 7);

        List<String> ids = railIds("/products/best-selling", "size", "50");
        assertThat(ids).contains(sold.id()).doesNotContain(unsold.id());
    }

    /**
     * A category with nothing in it answers with an empty rail, not a 500.
     *
     * Narrowing asks orders to rank a candidate set catalog hands it, and for an
     * unknown category that set is empty - which as a literal {@code IN ()} is a
     * syntax error on Postgres rather than a query returning nothing. Guarded in
     * ProductSalesQueryService; this is the case that would reach it.
     */
    @Test
    void anEmptyCategoryAnswersWithAnEmptyRail() throws Exception {
        mockMvc.perform(get("/products/best-selling").param("category", "no-such-category-" + UUID.randomUUID()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty());
    }

    // -------------------------------------------------------------- new arrivals

    /**
     * "New this week" now actually means this week.
     *
     * The old rail was an ORDER BY with no WHERE, so this product - listed a month
     * ago, and the newest thing in a quiet catalog - would have headed it. The rail
     * returning nothing on a week with no listings is the point, not a shortcoming:
     * the client drops a rail it has no rows for instead of printing "new" over old
     * stock.
     */
    @Test
    void theNewArrivalsRailExcludesListingsOlderThanItsWindow() throws Exception {
        Listing lastMonth = listing(category("rail-new"), "Listed A Month Ago");
        Listing today = listing(category("rail-new"), "Listed Today");
        backdateListing(lastMonth, Duration.ofDays(30));

        assertThat(railIds("/products/new", "withinDays", "7", "size", "50"))
                .contains(today.id())
                .doesNotContain(lastMonth.id());

        // Widen the window and the same product is inside it - the bound is the only
        // thing that excluded it.
        assertThat(railIds("/products/new", "withinDays", "90", "size", "50"))
                .contains(today.id(), lastMonth.id());
    }

    /** A listing the seller has not published is not an arrival. */
    @Test
    void theNewArrivalsRailShowsOnlyPublishedListings() throws Exception {
        Listing draft = listing(category("rail-new-draft"), "Unpublished Arrival");
        Product product = products.findById(draft.productId()).orElseThrow();
        product.setStatus(ProductStatus.DRAFT);
        products.save(product);

        assertThat(railIds("/products/new", "withinDays", "7", "size", "50"))
                .doesNotContain(draft.id());
    }

    /**
     * A rail is a handful of tiles, and size says how many of them.
     *
     * The controller also clamps the top end - ?size=100000 becomes fifty - so that
     * one request cannot ask for the whole catalog to be ranked and then enriched
     * with price, stock, thumbnail, rating and storefront. That ceiling is not
     * asserted here: it would take seeding fifty-one listings to observe, and an
     * assertion that cannot fail at this data volume documents nothing.
     */
    @Test
    void theRailReturnsAtMostTheSizeAskedFor() throws Exception {
        String category = category("rail-size");
        listing(category, "Tile One");
        listing(category, "Tile Two");
        listing(category, "Tile Three");

        assertThat(railIds("/products/new", "withinDays", "7", "size", "1")).hasSize(1);
        assertThat(railIds("/products/new", "withinDays", "7", "size", "2")).hasSize(2);
    }

    /**
     * The rail routes are reserved segments, and they win over a product slug.
     *
     * Spring's PathPattern prefers a literal over the {@code {productRef}} variable
     * on the same prefix, so this is settled by the framework rather than by
     * declaration order. It is asserted because the consequence is real: a product
     * whose title slugs to exactly "best-selling" is unreachable by slug and reachable
     * only by id. That is the right trade for a fixed route the whole landing page
     * depends on, but it should be a decision on the record rather than a surprise.
     */
    @Test
    void theRailPathIsNotMistakenForAProductSlug() throws Exception {
        products.save(Product.builder()
                .sellerId(seller.getId())
                .title("Best Selling")
                .categoryId(Fixtures.categoryId(categories, category("rail-slug")))
                .slug("best-selling")
                .build());

        mockMvc.perform(get("/products/best-selling"))
                .andExpect(status().isOk())
                // The rail's shape, not a product's: a page with content, not a detail
                // response with a title.
                .andExpect(jsonPath("$.content").exists());
    }

    // ------------------------------------------------------------------ helpers

    /** A category slug nothing else in the suite uses, so a rail can be narrowed to it. */
    private String category(String tag) {
        String slug = tag + "-" + UUID.randomUUID().toString().substring(0, 8);
        Fixtures.categoryId(categories, slug);
        return slug;
    }

    /** An active listing with one variant and one priced, in-stock offer. */
    private Listing listing(String categorySlug, String title) {
        Product product = products.save(Product.builder()
                .sellerId(seller.getId())
                .title(title)
                .categoryId(Fixtures.categoryId(categories, categorySlug))
                .slug(Fixtures.uniqueSlug(title))
                .build());
        Variant variant = variants.save(Variant.builder()
                .productId(product.getId())
                .label("One size")
                .sku("SKU-" + UUID.randomUUID())
                .build());
        Offer offer = offers.save(Offer.builder()
                .variantId(variant.getId())
                .price(new BigDecimal("24.00"))
                .stockQty(1_000)
                .build());
        return new Listing(product.getId(), variant.getId(), offer.getId());
    }

    /**
     * One order carrying one line for this listing.
     *
     * Written straight into the tables rather than posted through checkout: checkout
     * decrements stock, refuses a seller their own product and has a cart's worth of
     * rules of its own, none of which this class is about. What the ranking reads is
     * order_line, and these are the rows it reads.
     */
    private void sell(Listing listing, int quantity) {
        Order order = orders.save(Order.builder()
                .buyerIdentityId(buyer.getId())
                .buyerEmailSnapshot(buyer.getEmail())
                .buyerPhone("+15551234567")
                .status(OrderStatus.PLACED)
                .shippingAddress(address())
                .billingAddress(address())
                .billingSameAsShipping(true)
                .build());
        orderLines.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(listing.offerId())
                .productIdSnapshot(listing.productId())
                .variantIdSnapshot(listing.variantId())
                .sellerIdSnapshot(seller.getId())
                .unitPriceSnapshot(new BigDecimal("24.00"))
                .quantity(quantity)
                .build());
    }

    /**
     * Ages this listing's sales.
     *
     * order_line.created_at is @CreationTimestamp and updatable = false, so Hibernate
     * leaves it out of both the insert and the update - a direct UPDATE is the only
     * way to have sold something last year without waiting for next year.
     */
    private void backdateSales(Listing listing, Duration age) {
        jdbc.update("UPDATE order_line SET created_at = ? WHERE product_id_snapshot = ?",
                Timestamp.from(Instant.now().minus(age)), listing.productId());
    }

    /** The same trick on product.created_at, which carries the same annotations. */
    private void backdateListing(Listing listing, Duration age) {
        jdbc.update("UPDATE product SET created_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(age)), listing.productId());
    }

    /**
     * The ids a rail returns, in the order it returned them.
     *
     * Read out of the body rather than asserted with a jsonPath matcher because a
     * filter that matches exactly one row unwraps to a scalar, and an assertion about
     * ORDER has to see the list as a list either way.
     */
    private List<String> railIds(String path, String... params) throws Exception {
        var request = get(path);
        for (int i = 0; i < params.length; i += 2) {
            request = request.param(params[i], params[i + 1]);
        }
        String body = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.content[*].id");
    }

    private static Address address() {
        return Address.builder()
                .fullName("Rail Buyer")
                .line1("1 Main St")
                .city("Springfield")
                .state("IL")
                .postalCode("62704")
                .country("US")
                .build();
    }

    /** A product and the variant/offer an order line has to point at to be a sale. */
    private record Listing(UUID productId, UUID variantId, UUID offerId) {

        /** The product id, which is what every assertion in this class is about. */
        String id() {
            return productId.toString();
        }
    }
}
