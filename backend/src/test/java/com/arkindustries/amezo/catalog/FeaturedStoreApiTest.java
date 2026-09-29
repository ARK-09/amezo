package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.BuyerIdentity;
import com.arkindustries.amezo.identity.BuyerIdentityRepository;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.identity.SellerStore;
import com.arkindustries.amezo.identity.SellerStoreRepository;
import com.arkindustries.amezo.identity.StoreStatus;
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
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/v1/stores/featured - who the landing page puts forward, and why.
 *
 * <h2>What this replaces</h2>
 *
 * The "Featured seller" panel was assembled in the browser out of whichever product
 * happened to be first in a rail: its brandName as the heading and its StoreRef as
 * the link. So "featured" meant "listed most recently", and the shop's own cover and
 * logo could never appear, because a StoreRef is {id, name, handle} and carries no
 * artwork. A store is data the server holds; this hands it over.
 *
 * <h2>What these tests pin</h2>
 *
 * The ranking, and the three ways a shop is disqualified from it. The negative cases
 * are the ones that matter: a closed shop, an empty shop and a seller with no store
 * row would all have been perfectly good answers to "the first product's brand", and
 * each one puts a dead end on the front page.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FeaturedStoreApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final String ROUTE = "/api/v1/stores/featured";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private SellerRepository sellers;
    @Autowired private SellerStoreRepository stores;
    @Autowired private BuyerIdentityRepository buyers;
    @Autowired private CategoryRepository categories;
    @Autowired private ProductRepository products;
    @Autowired private VariantRepository variants;
    @Autowired private OfferRepository offers;
    @Autowired private OrderRepository orders;
    @Autowired private OrderLineRepository orderLines;

    private BuyerIdentity buyer;

    /**
     * The endpoint ranks the WHOLE marketplace, and rows outlive a test method, so
     * each one starts from an empty product and order_line table. Truncating is
     * honest here in a way it would not be elsewhere: the subject of these tests is
     * a ranking over everything, and "everything" has to be what this test put there.
     */
    @BeforeEach
    void emptyTheMarketplace() {
        jdbc.execute("TRUNCATE order_line, orders, offer, variant, product, seller_store CASCADE");
        buyer = buyers.save(BuyerIdentity.builder()
                .email("featured-buyer-" + UUID.randomUUID() + "@example.com")
                .fullName("Featured Buyer")
                .build());
    }

    /**
     * The headline: shops are ordered by the units they have shifted.
     *
     * Every shop here is open, stocked and has sold, so nothing disqualifies any of
     * them - the quantities are the only thing separating them. The sales are then
     * assigned against the sellers' own generated ids, smallest-id-sells-least, so a
     * query that ranked by primary key returns the exact REVERSE of this answer
     * rather than something merely different. Asserting an order against ids the
     * database invents is otherwise a coin toss that passes while broken.
     */
    @Test
    void shopsAreOrderedByTheUnitsTheyHaveSold() throws Exception {
        List<Shop> byId = Stream.of(shop("First Shop"), shop("Second Shop"), shop("Third Shop"))
                .sorted(Comparator.comparing(Shop::sellerId))
                .toList();
        sell(byId.get(0), 2);
        sell(byId.get(1), 15);
        sell(byId.get(2), 60);

        assertThat(featuredHandles(5)).containsExactly(
                byId.get(2).handle(), byId.get(1).handle(), byId.get(0).handle());

        // And the landing page asks for one, which is the top of that same list.
        mockMvc.perform(get(ROUTE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].handle").value(byId.get(2).handle()));
    }

    /**
     * The card carries the shop's own artwork, which is the whole reason this is an
     * endpoint rather than a tile built from a product.
     *
     * coverUrl and logoUrl are columns on seller_store that nothing on the landing
     * page could previously reach: a StoreRef has neither, so the panel had no
     * picture available to it at any price.
     */
    @Test
    void theFeaturedStoreCarriesItsCoverAndLogo() throws Exception {
        Shop shop = shop("Pictured Goods");
        stores.findBySellerId(shop.sellerId()).ifPresent(store -> {
            store.setCoverUrl("https://cdn.example.com/cover.webp");
            store.setLogoUrl("https://cdn.example.com/logo.webp");
            store.setTagline("Handmade, mostly");
            stores.save(store);
        });
        sell(shop, 2);

        mockMvc.perform(get(ROUTE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].coverUrl").value("https://cdn.example.com/cover.webp"))
                .andExpect(jsonPath("$[0].logoUrl").value("https://cdn.example.com/logo.webp"))
                .andExpect(jsonPath("$[0].tagline").value("Handmade, mostly"))
                // Assembled the same way as the store page it opens, so the count on
                // the card and the count on the page cannot disagree.
                .andExpect(jsonPath("$[0].productCount").value(1));
    }

    /**
     * A shop that is not trading is not featured, however well it sold.
     *
     * VACATION and CLOSED both mean "do not send shoppers here now". This is
     * identity's judgement rather than the ranking's - orders ranks sales and knows
     * nothing about shop status - and it is the disqualification most likely to be
     * lost in a refactor, because the seller who closed the shop still has the sales.
     */
    @Test
    void aShopThatIsClosedOrOnVacationIsNotFeatured() throws Exception {
        Shop away = shop("Away For Now");
        Shop open = shop("Still Open");
        sell(away, 100);
        sell(open, 1);
        setStatus(away, StoreStatus.VACATION);

        assertThat(featuredHandles(5)).containsExactly(open.handle());

        setStatus(away, StoreStatus.CLOSED);
        assertThat(featuredHandles(5)).containsExactly(open.handle());

        // Re-opened, and it is back at the front on the strength of its sales.
        setStatus(away, StoreStatus.OPEN);
        assertThat(featuredHandles(5)).containsExactly(away.handle(), open.handle());
    }

    /**
     * Nor is a shop with nothing to sell.
     *
     * It can happen to a real shop: everything it ever listed is now archived, while
     * the sales that ranked it are still on record. Featuring it would put a "Visit
     * the storefront" button in front of an empty page.
     */
    @Test
    void aShopWithNoLiveListingsIsNotFeatured() throws Exception {
        Shop emptied = shop("Sold Out And Gone");
        Shop stocked = shop("Still Stocked");
        sell(emptied, 80);
        sell(stocked, 1);

        Product listing = products.findById(emptied.productId()).orElseThrow();
        listing.setStatus(ProductStatus.ARCHIVED);
        products.save(listing);

        assertThat(featuredHandles(5)).containsExactly(stocked.handle());
    }

    /**
     * A marketplace with no orders still has a featured shop.
     *
     * The case every new deployment is in on its first day. Sales are the better
     * signal and the rail prefers them, but "nobody has bought anything yet" is not a
     * reason to show an empty panel - so it falls back to the shops with the most
     * listings, which is still a fact about the marketplace rather than an arbitrary
     * pick.
     */
    @Test
    void withNoSalesAtAllTheBiggestCatalogueIsFeatured() throws Exception {
        Shop small = shop("One Thing");
        Shop large = shop("Plenty To See");
        listMore(large, 3);

        assertThat(featuredHandles(5)).containsExactly(large.handle(), small.handle());
    }

    /**
     * And a shop that HAS sold still outranks a bigger shop that has not.
     *
     * The two rules are a preference, not a switch: the fallback tops the list up
     * rather than replacing it, so the marketplace's first sale does not have to wait
     * for a bigger catalogue to be noticed.
     */
    @Test
    void oneSaleOutranksAFatCatalogueWithNone() throws Exception {
        Shop seller = shop("Sold One");
        Shop browser = shop("Sold Nothing");
        listMore(browser, 10);
        sell(seller, 1);

        assertThat(featuredHandles(5)).containsExactly(seller.handle(), browser.handle());
    }

    /** With no shop at all, an empty array - and the panel drops itself. */
    @Test
    void anEmptyMarketplaceFeaturesNobody() throws Exception {
        mockMvc.perform(get(ROUTE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    /**
     * "featured" is the rail, not a shop that happens to be called that.
     *
     * Spring prefers the literal segment over {handle}, so a store at this handle
     * would be unreachable at its own URL. The handle is reserved in identity for
     * that reason; this asserts the routing half of the same fact.
     */
    @Test
    void theRouteIsNotMistakenForAStoreHandle() throws Exception {
        mockMvc.perform(get(ROUTE))
                .andExpect(status().isOk())
                // An array, not the single object a store page answers with.
                .andExpect(jsonPath("$").isArray());
    }

    // ------------------------------------------------------------------ helpers

    private List<String> featuredHandles(int size) throws Exception {
        String body = mockMvc.perform(get(ROUTE).param("size", String.valueOf(size)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$[*].handle");
    }

    /** A seller with an OPEN store and one active listing behind a priced offer. */
    private Shop shop(String name) {
        Seller seller = sellers.save(Seller.builder()
                .email("featured-" + UUID.randomUUID() + "@example.com")
                .fullName(name)
                .build());
        String handle = "shop-" + UUID.randomUUID().toString().substring(0, 8);
        stores.save(SellerStore.builder()
                .sellerId(seller.getId())
                .name(name)
                .handle(handle)
                .status(StoreStatus.OPEN)
                .build());

        Product product = products.save(Product.builder()
                .sellerId(seller.getId())
                .title(name + " Staple")
                .categoryId(Fixtures.categoryId(categories, "featured-test"))
                .slug(Fixtures.uniqueSlug(name))
                .build());
        Variant variant = variants.save(Variant.builder()
                .productId(product.getId())
                .label("One size")
                .sku("SKU-" + UUID.randomUUID())
                .build());
        Offer offer = offers.save(Offer.builder()
                .variantId(variant.getId())
                .price(new BigDecimal("30.00"))
                .stockQty(500)
                .build());
        return new Shop(seller.getId(), handle, product.getId(), variant.getId(), offer.getId());
    }

    /** More listings for this shop, for the catalogue-size fallback. */
    private void listMore(Shop shop, int count) {
        for (int i = 0; i < count; i++) {
            products.save(Product.builder()
                    .sellerId(shop.sellerId())
                    .title("Extra " + i)
                    .categoryId(Fixtures.categoryId(categories, "featured-test"))
                    .slug(Fixtures.uniqueSlug("extra-" + i))
                    .build());
        }
    }

    private void setStatus(Shop shop, StoreStatus status) {
        SellerStore store = stores.findBySellerId(shop.sellerId()).orElseThrow();
        store.setStatus(status);
        stores.save(store);
    }

    /** One order with one line, written straight in - see ProductRailApiTest. */
    private void sell(Shop shop, int quantity) {
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
                .offerId(shop.offerId())
                .productIdSnapshot(shop.productId())
                .variantIdSnapshot(shop.variantId())
                .sellerIdSnapshot(shop.sellerId())
                .unitPriceSnapshot(new BigDecimal("30.00"))
                .quantity(quantity)
                .build());
    }

    private static Address address() {
        return Address.builder()
                .fullName("Featured Buyer")
                .line1("1 Main St")
                .city("Springfield")
                .state("IL")
                .postalCode("62704")
                .country("US")
                .build();
    }

    private record Shop(UUID sellerId, String handle, UUID productId, UUID variantId, UUID offerId) {
    }
}
