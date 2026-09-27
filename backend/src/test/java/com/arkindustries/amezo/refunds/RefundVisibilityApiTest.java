package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.identity.BuyerIdentity;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.refunds.RefundFixture.LineSpec;
import com.arkindustries.amezo.refunds.RefundFixture.SeededOrder;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * What a refund looks like from the BUYER's own orders, at every stage of it.
 *
 * <h2>The bug this is the guard for</h2>
 *
 * The refund domain published everything an order needs to know
 * ({@code refunds.api.OrderRefundQuery}) and the seller's order list read it - but
 * the buyer's did not ask. So a seller could approve and pay out a refund and the
 * buyer's My Orders went on saying DELIVERED, with no badge, no status, no refund
 * anywhere on the card, and a Refunds tab honestly counting zero. The two sides of
 * one order disagreed about what had happened to it.
 *
 * <h2>Why it lives in the refunds package</h2>
 *
 * It drives the real refund endpoints - raise, approve, settle - which needs
 * {@link RefundFixture}, and that is a package-private {@code @TestComponent} here.
 * The assertions are on {@code /api/v1/orders}, so this is deliberately an
 * integration test ACROSS the two features rather than a test of either: what is
 * being pinned is that they agree.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Import(RefundFixture.class)
class RefundVisibilityApiTest {

    private static final String REFUNDS = "/api/v1/refund-requests";
    private static final String ONE_REFUND = REFUNDS + "/{id}";
    private static final String ORDERS = "/api/v1/orders";
    private static final String ONE_ORDER = ORDERS + "/{id}";

    private static final String DETAIL =
            "The left earcup stopped producing sound about a week after delivery.";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired private MockMvc mockMvc;
    @Autowired private RefundFixture fixture;
    @Autowired private JdbcTemplate jdbc;

    /**
     * The whole journey, from the buyer's side of the glass.
     *
     * Asserted at each step rather than only at the end, because every one of them was
     * a separate silence: an order with a request against it said nothing, an approved
     * one said nothing, and a paid-out one still said DELIVERED.
     */
    @Test
    void theBuyersOrderFollowsTheRefundFromRaisedToPaidOut() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora One Headphones", "149.00", 1));
        deliver(order.id());
        Cookie buyerCookie = fixture.buyerCookie(buyer);
        Cookie sellerCookie = fixture.sellerCookie(seller);

        // Before anything is raised: no badge, and the buyer may ask.
        mockMvc.perform(get(ONE_ORDER, order.id()).cookie(buyerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DELIVERED"))
                .andExpect(jsonPath("$.refundRequests.length()").value(0))
                .andExpect(jsonPath("$.canRequestRefund").value(true))
                .andExpect(jsonPath("$.refundWindowEndsAt").isNotEmpty());

        UUID request = raise(buyerCookie, order);

        // Raised. The card's badge reads these two, the line wears an "IN REFUND" tag
        // off its own pair, and the request itself is listed.
        mockMvc.perform(get(ONE_ORDER, order.id()).cookie(buyerCookie))
                .andExpect(jsonPath("$.status").value("DELIVERED"))
                .andExpect(jsonPath("$.refundRequests.length()").value(1))
                .andExpect(jsonPath("$.refundRequests[0].status").value("REQUESTED"))
                .andExpect(jsonPath("$.refundRequests[0].reference").isNotEmpty())
                .andExpect(jsonPath("$.refundRequests[0].requestedAmount").value(149.00))
                .andExpect(jsonPath("$.lines[0].refundStatus").value("REQUESTED"))
                .andExpect(jsonPath("$.lines[0].refundRequestId").value(request.toString()))
                // Every unit of the only line is spoken for, so there is nothing left to
                // ask about - the same rule POST would enforce.
                .andExpect(jsonPath("$.canRequestRefund").value(false));

        mockMvc.perform(get(ORDERS).cookie(buyerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + order.id() + "')].openRefundStatus")
                        .value("REQUESTED"))
                .andExpect(jsonPath("$.content[?(@.id=='" + order.id() + "')].openRefundRequestId")
                        .value(request.toString()));

        patchOk(sellerCookie, request, """
                {"status":"AWAITING_RETURN"}""");

        // Approved. Still not refunded - no money has moved - which is exactly the
        // distinction a buyer needs the status for.
        mockMvc.perform(get(ONE_ORDER, order.id()).cookie(buyerCookie))
                .andExpect(jsonPath("$.status").value("DELIVERED"))
                .andExpect(jsonPath("$.refundRequests[0].status").value("AWAITING_RETURN"))
                .andExpect(jsonPath("$.lines[0].refundStatus").value("AWAITING_RETURN"));

        patchOk(sellerCookie, request, """
                {"status":"RETURN_RECEIVED"}""");
        patchOk(sellerCookie, request, """
                {"status":"REFUNDED"}""");

        // Paid out. REFUNDED is DERIVED from the settled request, never stored - and it
        // is the same answer the seller's own list gives for this order.
        mockMvc.perform(get(ONE_ORDER, order.id()).cookie(buyerCookie))
                .andExpect(jsonPath("$.status").value("REFUNDED"))
                .andExpect(jsonPath("$.refundRequests[0].status").value("REFUNDED"))
                .andExpect(jsonPath("$.refundRequests[0].approvedAmount").value(149.00))
                // The LINE's own pair is cleared: the contract sets those "when this line
                // is inside an OPEN refund request", and this one is settled. The
                // request's own line list is what still says the money came back on it.
                .andExpect(jsonPath("$.lines[0].refundStatus").isEmpty())
                .andExpect(jsonPath("$.lines[0].refundRequestId").isEmpty());

        mockMvc.perform(get(ORDERS).cookie(buyerCookie))
                .andExpect(jsonPath("$.content[?(@.id=='" + order.id() + "')].status")
                        .value("REFUNDED"))
                // The badge still names the request, settled or not: "a refund that has
                // been approved or declined does not read the same as one nobody has
                // looked at yet".
                .andExpect(jsonPath("$.content[?(@.id=='" + order.id() + "')].openRefundStatus")
                        .value("REFUNDED"));
    }

    /**
     * The tab a buyer goes to when they want to know what happened to a return.
     *
     * A settled refund staying in it is the point: dropping out at the moment the money
     * moved would hide the refund exactly when they came looking for it. The order is
     * simultaneously out of "in progress" and out of "delivered", because REFUNDED is
     * what it is now.
     */
    @Test
    void aSettledRefundStaysInTheRefundsTab() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        deliver(order.id());
        Cookie buyerCookie = fixture.buyerCookie(buyer);
        Cookie sellerCookie = fixture.sellerCookie(seller);

        UUID request = raise(buyerCookie, order);
        // Open: in the Refunds tab, and still in whichever fulfilment bucket the order
        // is really in - the card's own badge is what says a request is live.
        assertInGroup(buyerCookie, "refunds", order.id(), true);
        assertInGroup(buyerCookie, "delivered", order.id(), true);

        patchOk(sellerCookie, request, """
                {"status":"AWAITING_RETURN"}""");
        patchOk(sellerCookie, request, """
                {"status":"RETURN_RECEIVED"}""");
        patchOk(sellerCookie, request, """
                {"status":"REFUNDED"}""");

        assertInGroup(buyerCookie, "refunds", order.id(), true);
        assertInGroup(buyerCookie, "delivered", order.id(), false);
        assertInGroup(buyerCookie, "in_progress", order.id(), false);
        assertInGroup(buyerCookie, "all", order.id(), true);

        // And the tab's count agrees with the list it opens, which is the whole reason
        // the facets share one pipeline with it.
        mockMvc.perform(get(ORDERS + "/facets").cookie(buyerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.facets[?(@.key=='refunds')].count").value(1));
    }

    /**
     * A DECLINED request is not a refund and leaves nothing tagged - but the order still
     * carries it, and the buyer may ask again.
     *
     * Both halves matter. A declined request that kept the line tagged would tell the
     * buyer something was being returned when nothing was; one that vanished would
     * leave them with no record of having been told no.
     */
    @Test
    void aDeclinedRequestIsStillOnTheOrderAndReleasesItsLine() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Stand", "39.00", 1));
        deliver(order.id());
        Cookie buyerCookie = fixture.buyerCookie(buyer);

        UUID request = raise(buyerCookie, order);
        patchOk(fixture.sellerCookie(seller), request, """
                {"status":"DECLINED","declineReason":"Outside the 30-day return window"}""");

        mockMvc.perform(get(ONE_ORDER, order.id()).cookie(buyerCookie))
                // Not refunded: no money moved.
                .andExpect(jsonPath("$.status").value("DELIVERED"))
                .andExpect(jsonPath("$.refundRequests.length()").value(1))
                .andExpect(jsonPath("$.refundRequests[0].status").value("DECLINED"))
                .andExpect(jsonPath("$.lines[0].refundStatus").isEmpty())
                // A declined request releases its units, so asking again is allowed - and
                // the flag has to say so, or the button is hidden from someone the
                // endpoint would let straight through.
                .andExpect(jsonPath("$.canRequestRefund").value(true));

        assertInGroup(buyerCookie, "refunds", order.id(), true);
    }

    /**
     * canRequestRefund is server-owned and has to mean what POST enforces.
     *
     * The interesting case is a PARTIALLY refunded order: it derives to REFUNDED, but
     * the items the buyer kept are still returnable, so the flag must stay true. The
     * flag reads the STORED fulfilment status for exactly this reason - testing the
     * derived one would hide the button from someone entitled to press it.
     */
    @Test
    void aPartlyRefundedOrderCanStillBeAskedAboutForTheItemsThatWereKept() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(
                seller, buyer,
                LineSpec.of("Aurora One Headphones", "149.00", 1),
                LineSpec.of("Aurora Case", "29.00", 1));
        deliver(order.id());
        Cookie buyerCookie = fixture.buyerCookie(buyer);
        Cookie sellerCookie = fixture.sellerCookie(seller);

        UUID first = raiseLine(buyerCookie, order, 0);
        patchOk(sellerCookie, first, """
                {"status":"AWAITING_RETURN"}""");
        patchOk(sellerCookie, first, """
                {"status":"RETURN_RECEIVED"}""");
        patchOk(sellerCookie, first, """
                {"status":"REFUNDED"}""");

        mockMvc.perform(get(ONE_ORDER, order.id()).cookie(buyerCookie))
                .andExpect(jsonPath("$.status").value("REFUNDED"))
                // The second line was never claimed, so something is still returnable.
                .andExpect(jsonPath("$.canRequestRefund").value(true));

        // And the endpoint agrees, which is the only thing that makes the flag worth
        // publishing: a second request against the kept item is accepted.
        mockMvc.perform(post(REFUNDS).cookie(buyerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(1))))
                .andExpect(status().isCreated());
    }

    // ------------------------------------------------------------------ helpers

    /**
     * Marks the order delivered, which is what makes it refundable.
     *
     * A direct UPDATE rather than the seller's own PATCH: what is under test here is the
     * refund's visibility, and walking PLACED -> PACKED -> SHIPPED -> DELIVERED through
     * the API first would make every one of these tests also a fulfilment test.
     */
    private void deliver(UUID orderId) {
        jdbc.update("UPDATE orders SET status = 'DELIVERED', delivered_at = now() WHERE id = ?", orderId);
    }

    /**
     * Whether the order shows up under one of My Orders' tabs.
     *
     * The ids are read out of the body and checked here rather than with a jsonPath
     * filter: a filter that matches exactly one row unwraps to a scalar and one that
     * matches none to an empty list, so the same expression needs two different
     * matchers depending on the answer - which is the opposite of what an assertion
     * helper is for.
     */
    private void assertInGroup(Cookie buyerCookie, String group, UUID orderId, boolean expected)
            throws Exception {
        String body = mockMvc.perform(get(ORDERS).cookie(buyerCookie).param("group", group))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        List<String> ids = JsonPath.read(body, "$.content[*].id");
        assertThat(ids.contains(orderId.toString()))
                .as("order %s should %s be in the %s tab", orderId, expected ? "" : "not", group)
                .isEqualTo(expected);
    }

    private UUID raise(Cookie buyerCookie, SeededOrder order) throws Exception {
        return raiseLine(buyerCookie, order, 0);
    }

    private UUID raiseLine(Cookie buyerCookie, SeededOrder order, int lineIndex) throws Exception {
        MvcResult result = mockMvc.perform(post(REFUNDS).cookie(buyerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(lineIndex))))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.id"));
    }

    private static String createBody(UUID orderId, UUID lineId) {
        return """
                {"orderId":"%s","lines":[{"orderLineId":"%s","quantity":1}],
                 "resolution":"REFUND","payout":"ORIGINAL_PAYMENT","detail":"%s"}
                """.formatted(orderId, lineId, DETAIL);
    }

    private ResultActions patchOk(Cookie cookie, UUID requestId, String body) throws Exception {
        return mockMvc.perform(patch(ONE_REFUND, requestId).cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }
}
