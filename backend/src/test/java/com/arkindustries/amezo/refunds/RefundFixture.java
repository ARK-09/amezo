package com.arkindustries.amezo.refunds;

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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Seeds the world a refund needs: a seller, a buyer, a product with a priced offer,
 * and an order with lines against it.
 *
 * A bean in the test source tree rather than more static methods on
 * support.Fixtures, for two reasons. It needs eight repositories injected, which as
 * static helpers would mean eight parameters at every call site. And it reaches into
 * catalog's, identity's and orders' entities - legitimate test setup that
 * PackageBoundaryTest allows only because it excludes tests, and keeping it in one
 * class makes that obvious rather than scattering the same imports across every
 * refund test.
 *
 * <h2>Every identity it creates is unique</h2>
 *
 * Emails and SKUs carry a random suffix, and nothing is looked up by a fixed name.
 * The container is shared across a class's methods and rows are never cleaned up
 * between them, so a fixture that reused an email would fail on whichever test
 * happened to run second - which is exactly the ordering fragility the pre-existing
 * failures on main show.
 */
/*
 * @TestComponent, not @Component: Spring Boot's TypeExcludeFilter keeps these out
 * of the application's own component scan, so this bean exists only in the contexts
 * that @Import it. A plain @Component in the test tree would be scanned into EVERY
 * Spring context in the suite - including catalog's and reviews' - which is context
 * pollution for no reason.
 */
@TestComponent
class RefundFixture {

    /** Satisfies the NOT NULL columns V12 added; no test asserts on it. */
    private static final String PHONE = "+15551234567";

    @Autowired private JdbcTemplate jdbc;
    @Autowired private SellerRepository sellers;
    @Autowired private BuyerIdentityRepository buyers;
    @Autowired private SessionRepository sessions;
    @Autowired private ProductRepository products;
    @Autowired private VariantRepository variants;
    @Autowired private OfferRepository offers;
    @Autowired private CategoryRepository categories;
    @Autowired private OrderRepository orders;
    @Autowired private OrderLineRepository orderLines;

    Seller seller() {
        return sellers.save(Seller.builder().email("seller-" + UUID.randomUUID() + "@example.com").build());
    }

    BuyerIdentity buyer() {
        return buyers.save(BuyerIdentity.builder()
                .email("buyer-" + UUID.randomUUID() + "@example.com")
                .fullName("Jonas Lindqvist")
                .build());
    }

    Cookie sellerCookie(Seller seller) {
        return Fixtures.sessionCookie(sessions, IdentityType.SELLER, seller.getId());
    }

    Cookie buyerCookie(BuyerIdentity buyer) {
        return Fixtures.sessionCookie(sessions, IdentityType.BUYER, buyer.getId());
    }

    /** One order, one seller, one line per (price, quantity) pair given. */
    SeededOrder order(Seller seller, BuyerIdentity buyer, LineSpec... specs) {
        return order(seller, buyer, Instant.now(), specs);
    }

    /**
     * The same, placed at a chosen moment - which is what lets a test drive the
     * return window without waiting thirty days.
     */
    SeededOrder order(Seller seller, BuyerIdentity buyer, Instant placedAt, LineSpec... specs) {
        Order order = orders.save(Order.builder()
                .buyerIdentityId(buyer.getId())
                .buyerEmailSnapshot(buyer.getEmail())
                .status(OrderStatus.PLACED)
                .buyerPhone(PHONE)
                .shippingAddress(address())
                .billingAddress(address())
                .build());

        // placed_at is @CreationTimestamp and updatable = false, so neither the
        // builder nor a save can set it - Hibernate simply leaves the column out of
        // both statements. A direct UPDATE is the only way to seed an order old
        // enough to be outside the return window, and the entity is then refreshed
        // so the caller sees the date the database holds.
        if (placedAt.isBefore(order.getPlacedAt().minusSeconds(1))) {
            jdbc.update("UPDATE orders SET placed_at = ? WHERE id = ?",
                    Timestamp.from(placedAt), order.getId());
            order = orders.findById(order.getId()).orElseThrow();
        }

        List<OrderLine> saved = new ArrayList<>();
        for (LineSpec spec : specs) {
            UUID productId = seedProduct(seller.getId(), spec.title());
            UUID variantId = seedVariant(productId, spec.variantLabel());
            saved.add(orderLines.save(OrderLine.builder()
                    .orderId(order.getId())
                    .offerId(seedOffer(variantId, spec.unitPrice()))
                    .productIdSnapshot(productId)
                    .variantIdSnapshot(variantId)
                    .sellerIdSnapshot(seller.getId())
                    .unitPriceSnapshot(spec.unitPrice())
                    .quantity(spec.quantity())
                    .build()));
        }
        return new SeededOrder(order, saved);
    }

    /** Adds one more line to an existing order, owned by a DIFFERENT seller. */
    OrderLine addLineForOtherSeller(Order order, Seller otherSeller, LineSpec spec) {
        UUID productId = seedProduct(otherSeller.getId(), spec.title());
        UUID variantId = seedVariant(productId, spec.variantLabel());
        return orderLines.save(OrderLine.builder()
                .orderId(order.getId())
                .offerId(seedOffer(variantId, spec.unitPrice()))
                .productIdSnapshot(productId)
                .variantIdSnapshot(variantId)
                .sellerIdSnapshot(otherSeller.getId())
                .unitPriceSnapshot(spec.unitPrice())
                .quantity(spec.quantity())
                .build());
    }

    private UUID seedProduct(UUID sellerId, String title) {
        return products.save(Product.builder()
                        .sellerId(sellerId)
                        .title(title)
                        .categoryId(Fixtures.categoryId(categories, "refund-test"))
                        .slug(Fixtures.uniqueSlug(title))
                        .build())
                .getId();
    }

    private UUID seedVariant(UUID productId, String label) {
        return variants.save(Variant.builder()
                        .productId(productId)
                        .label(label)
                        .sku("SKU-" + UUID.randomUUID())
                        .build())
                .getId();
    }

    /**
     * order_line.offer_id is a real FK (see V10), unlike the snapshot columns, so a
     * real offer row has to exist behind it or the insert fails.
     */
    private UUID seedOffer(UUID variantId, BigDecimal price) {
        Offer offer = offers.save(Offer.builder().variantId(variantId).price(price).stockQty(10).build());
        return offer.getId();
    }

    private static Address address() {
        return Address.builder()
                .fullName("Test Buyer")
                .line1("1 Main St")
                .city("Springfield")
                .state("IL")
                .postalCode("62701")
                .country("US")
                .build();
    }

    record LineSpec(String title, String variantLabel, BigDecimal unitPrice, int quantity) {

        static LineSpec of(String title, String price, int quantity) {
            return new LineSpec(title, "One size", new BigDecimal(price), quantity);
        }
    }

    record SeededOrder(Order order, List<OrderLine> lines) {

        UUID id() {
            return order.getId();
        }

        UUID lineId(int index) {
            return lines.get(index).getId();
        }
    }
}
