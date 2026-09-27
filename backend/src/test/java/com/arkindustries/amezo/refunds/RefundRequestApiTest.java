package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.identity.BuyerIdentity;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.refunds.RefundFixture.LineSpec;
import com.arkindustries.amezo.refunds.RefundFixture.SeededOrder;
import com.arkindustries.amezo.refunds.api.OrderRefundQuery;
import com.arkindustries.amezo.refunds.api.OrderRefundSnapshot;
import com.arkindustries.amezo.refunds.api.RefundWindowPolicy;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The refund resource: POST, GET and the PATCH that is the whole state machine.
 *
 * None of this existed before - no table, no endpoint, no enum value - so these
 * cases pin the rules rather than the happy path: every transition in the graph and
 * the ones that are not in it, a partial amount stored as given, an over-refund
 * refused, the return window, the duplicate-request 409, both directions of
 * isolation, and the order status that is DERIVED from a settled request rather than
 * written by anyone.
 *
 * Every fixture is uniquely named (see RefundFixture) so these pass in any order.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Import(RefundFixture.class)
class RefundRequestApiTest {

    private static final String REFUNDS = "/api/v1/refund-requests";
    private static final String ONE = REFUNDS + "/{id}";

    /** Long enough to satisfy the contract's 20-character floor. */
    private static final String DETAIL =
            "The left earcup stopped producing sound about a week after delivery.";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired private MockMvc mockMvc;
    @Autowired private RefundFixture fixture;
    @Autowired private RefundRequestRepository requests;
    @Autowired private RefundRequestLineRepository refundLines;
    @Autowired private OrderRefundQuery orderRefundQuery;
    @Autowired private RefundWindowPolicy refundWindowPolicy;

    // ------------------------------------------------------------------- create

    /**
     * The headline behaviour, and the whole of what the buyer's form does.
     *
     * The amount is asserted because it is computed from the ORDER's purchase-time
     * prices and never taken from the client - an amount a buyer could send would be
     * an over-refund waiting to happen.
     */
    @Test
    void aBuyerRaisesARequestAgainstTheirOwnOrderAndTheAmountComesFromTheOrder() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora One Headphones", "149.00", 2));

        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 2, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("REQUESTED"))
                .andExpect(jsonPath("$.resolution").value("REFUND"))
                .andExpect(jsonPath("$.requestedResolution").value("REFUND"))
                .andExpect(jsonPath("$.payout").value("ORIGINAL_PAYMENT"))
                // 2 x 149.00, from the order line's own unit price.
                .andExpect(jsonPath("$.requestedAmount").value(298.00))
                .andExpect(jsonPath("$.approvedAmount").doesNotExist())
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.reference").value(org.hamcrest.Matchers.startsWith("ref_")))
                .andExpect(jsonPath("$.orderReference").value(org.hamcrest.Matchers.startsWith("ord_")))
                .andExpect(jsonPath("$.lines.length()").value(1))
                // Resolved from the catalogue at read time, not stored on the refund.
                .andExpect(jsonPath("$.lines[0].productTitle").value("Aurora One Headphones"))
                .andExpect(jsonPath("$.lines[0].quantity").value(2))
                .andExpect(jsonPath("$.lines[0].lineTotal").value(298.00))
                // The buyer raising it is the first step of the history, so the
                // timeline is never empty.
                .andExpect(jsonPath("$.events.length()").value(1))
                .andExpect(jsonPath("$.events[0].status").value("REQUESTED"))
                // Nothing in this codebase captures how an order was paid.
                .andExpect(jsonPath("$.paymentMethod").doesNotExist())
                .andExpect(jsonPath("$.seller.name").isNotEmpty());
    }

    /** A partial selection prices itself. Picking one of two lines does not refund both. */
    @Test
    void requestingOneOfTwoLinesPricesOnlyThatLine() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer,
                LineSpec.of("Aurora One Headphones", "149.00", 1),
                LineSpec.of("Aurora Travel Case", "29.00", 1));

        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(1), 1, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.requestedAmount").value(29.00))
                .andExpect(jsonPath("$.lines.length()").value(1));
    }

    /** A replacement moves no money, so a payout on it is meaningless and is not stored. */
    @Test
    void aReplacementRequestNeedsNoPayoutAndKeepsNone() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));

        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 1, "REPLACEMENT", null)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.resolution").value("REPLACEMENT"))
                .andExpect(jsonPath("$.payout").doesNotExist());
    }

    /** Asking for money back without saying where it goes is a 422 naming the field. */
    @Test
    void aRefundWithoutAPayoutIs422() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));

        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 1, "REFUND", null)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("payout"));
    }

    /** The 20-character floor is the server's, not only the form's. */
    @Test
    void tooShortADetailIs422() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));

        String body = """
                {"orderId":"%s","lines":[{"orderLineId":"%s","quantity":1}],
                 "resolution":"REFUND","payout":"ORIGINAL_PAYMENT","detail":"broken"}
                """.formatted(order.id(), order.lineId(0));

        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnprocessableEntity());
    }

    /** More units than were bought cannot be sent back. */
    @Test
    void askingForMoreUnitsThanWereOrderedIs422() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 2));

        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 3, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].reason")
                        .value("more than remains returnable"));
    }

    /**
     * A second live request against the same line is the 409 the contract promises,
     * and V21's partial unique index is what makes it a guarantee rather than a race.
     */
    @Test
    void aSecondOpenRequestAgainstTheSameLineIs409() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 2));
        Cookie cookie = fixture.buyerCookie(buyer);

        mockMvc.perform(post(REFUNDS).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 1, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isCreated());

        mockMvc.perform(post(REFUNDS).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 1, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Refund already open"));
    }

    /**
     * A declined request releases its units: nothing was returned and nothing was
     * paid, so the buyer may come back for the same item.
     */
    @Test
    void aDeclinedRequestReleasesItsLineForAFreshRequest() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        Cookie buyerCookie = fixture.buyerCookie(buyer);

        UUID first = created(buyerCookie, order, 0, 1, "REFUND");
        patchOk(fixture.sellerCookie(seller), first,
                """
                {"status":"DECLINED","declineReason":"Item shows signs of use"}""");

        mockMvc.perform(post(REFUNDS).cookie(buyerCookie).contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 1, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isCreated());
    }

    /**
     * Past the return window, a request is a 422. Flagged in RefundWindowPolicy: the
     * window runs from placed_at because nothing in this schema records a delivery
     * date.
     */
    @Test
    void pastTheReturnWindowARequestIs422() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, Instant.now().minus(Duration.ofDays(45)),
                LineSpec.of("Aurora Buds", "99.00", 1));

        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 1, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.title").value("Return window closed"));
    }

    /**
     * An order can hold lines from several sellers (Order.sellerId is nullable and
     * unset by checkout), and a refund is owed by whoever sold the line - so a
     * request spanning two has no single decider and is refused rather than assigned
     * to one of them arbitrarily.
     */
    @Test
    void aRequestSpanningTwoSellersIs422() throws Exception {
        Seller mine = fixture.seller();
        Seller other = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(mine, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        UUID otherLine = fixture.addLineForOtherSeller(
                order.order(), other, LineSpec.of("Someone Else's Cable", "19.00", 1)).getId();

        String body = """
                {"orderId":"%s","lines":[{"orderLineId":"%s","quantity":1},
                 {"orderLineId":"%s","quantity":1}],"resolution":"REFUND",
                 "payout":"ORIGINAL_PAYMENT","detail":"%s"}
                """.formatted(order.id(), order.lineId(0), otherLine, DETAIL);

        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.title").value("Items from different sellers"));
    }

    // ------------------------------------------------------- authorization: buyer

    /**
     * Isolation, direction one: a buyer cannot raise a request against somebody
     * else's order. 404, not 403 - a 403 would confirm the order exists.
     */
    @Test
    void aBuyerCannotRaiseARequestAgainstAnotherBuyersOrder() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity owner = fixture.buyer();
        BuyerIdentity stranger = fixture.buyer();
        SeededOrder order = fixture.order(seller, owner, LineSpec.of("Aurora Buds", "99.00", 1));

        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 1, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isNotFound());
    }

    /** Nor read one they did not raise. */
    @Test
    void aBuyerCannotReadAnotherBuyersRequest() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity owner = fixture.buyer();
        BuyerIdentity stranger = fixture.buyer();
        SeededOrder order = fixture.order(seller, owner, LineSpec.of("Aurora Buds", "99.00", 1));
        UUID request = created(fixture.buyerCookie(owner), order, 0, 1, "REFUND");

        mockMvc.perform(get(ONE, request).cookie(fixture.buyerCookie(stranger)))
                .andExpect(status().isNotFound());

        // And the one who raised it can.
        mockMvc.perform(get(ONE, request).cookie(fixture.buyerCookie(owner)))
                .andExpect(status().isOk());
    }

    /** The buyer's only move is cancelling, and only while nobody has decided. */
    @Test
    void aBuyerMayCancelWhileRequestedAndNothingElse() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        Cookie cookie = fixture.buyerCookie(buyer);
        UUID request = created(cookie, order, 0, 1, "REFUND");

        // Approving their own refund is not a move the buyer has.
        mockMvc.perform(patch(ONE, request).cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"APPROVED"}"""))
                .andExpect(status().isConflict());

        mockMvc.perform(patch(ONE, request).cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"CANCELLED"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    // ------------------------------------------------------ authorization: seller

    /**
     * Isolation, direction two: a seller cannot see or decide a request against
     * another seller's lines, and the owning seller can.
     */
    @Test
    void aSellerCannotReadOrDecideAnotherSellersRequest() throws Exception {
        Seller owner = fixture.seller();
        Seller stranger = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(owner, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        mockMvc.perform(get(ONE, request).cookie(fixture.sellerCookie(stranger)))
                .andExpect(status().isNotFound());

        mockMvc.perform(patch(ONE, request).cookie(fixture.sellerCookie(stranger))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"AWAITING_RETURN"}"""))
                .andExpect(status().isNotFound());

        // The seller who owes it reads it and decides it.
        mockMvc.perform(get(ONE, request).cookie(fixture.sellerCookie(owner)))
                .andExpect(status().isOk());
        patchOk(fixture.sellerCookie(owner), request, """
                {"status":"AWAITING_RETURN"}""");
    }

    /** No session is a 401, which the frontend reads as "not signed in". */
    @Test
    void withoutASessionTheRoutesAre401() throws Exception {
        mockMvc.perform(get(REFUNDS)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(ONE, UUID.randomUUID())).andExpect(status().isUnauthorized());
        mockMvc.perform(post(REFUNDS).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    /** The collection is the buyer's. A seller has no requests they raised. */
    @Test
    void aSellerCannotReachTheBuyersCollection() throws Exception {
        Cookie seller = fixture.sellerCookie(fixture.seller());
        mockMvc.perform(get(REFUNDS).cookie(seller)).andExpect(status().isForbidden());
        mockMvc.perform(post(REFUNDS).cookie(seller)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    // ----------------------------------------------------------- the state machine

    /** The refund path, end to end, and the timeline it writes as it goes. */
    @Test
    void theRefundPathRunsRequestedToRefunded() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora One Headphones", "149.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        patchOk(sellerCookie, request, """
                {"status":"AWAITING_RETURN","approvedAmount":149.00,
                 "returnTrackingNumber":"AZ-RET-88412","note":"Post it back this week."}""")
                .andExpect(jsonPath("$.status").value("AWAITING_RETURN"))
                .andExpect(jsonPath("$.approvedAmount").value(149.00))
                .andExpect(jsonPath("$.approvedAt").isNotEmpty())
                .andExpect(jsonPath("$.returnTrackingNumber").value("AZ-RET-88412"))
                // The note is recorded against the step it was written for, which is
                // the whole reason the event log exists.
                .andExpect(jsonPath("$.events.length()").value(2))
                .andExpect(jsonPath("$.events[1].status").value("AWAITING_RETURN"))
                .andExpect(jsonPath("$.events[1].note").value("Post it back this week."));

        patchOk(sellerCookie, request, """
                {"status":"RETURN_RECEIVED"}""")
                .andExpect(jsonPath("$.status").value("RETURN_RECEIVED"))
                .andExpect(jsonPath("$.returnReceivedAt").isNotEmpty());

        patchOk(sellerCookie, request, """
                {"status":"REFUNDED"}""")
                .andExpect(jsonPath("$.status").value("REFUNDED"))
                .andExpect(jsonPath("$.refundedAt").isNotEmpty())
                .andExpect(jsonPath("$.events.length()").value(4));

        // Terminal: nothing moves out of REFUNDED.
        mockMvc.perform(patch(ONE, request).cookie(sellerCookie)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"RETURN_RECEIVED"}"""))
                .andExpect(status().isConflict());

        // A settled request releases its lines, which is what lets a fresh one be
        // raised later and what V21's partial index keys on.
        assertThat(refundLines.findByOrderLineIdInAndOpenIsTrue(List.of(order.lineId(0)))).isEmpty();
    }

    /**
     * The replacement path. APPROVED rather than AWAITING_RETURN, because there is
     * nothing to wait for - which is why both are reachable from REQUESTED.
     */
    @Test
    void theReplacementPathRunsRequestedToReplacementSent() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REPLACEMENT");

        patchOk(sellerCookie, request, """
                {"status":"APPROVED"}""")
                .andExpect(jsonPath("$.status").value("APPROVED"));

        patchOk(sellerCookie, request, """
                {"status":"REPLACEMENT_SENT"}""")
                .andExpect(jsonPath("$.status").value("REPLACEMENT_SENT"))
                .andExpect(jsonPath("$.replacementSentAt").isNotEmpty());
    }

    /**
     * The seller may settle a request as something other than what was asked for, and
     * the buyer's original ask survives it.
     */
    @Test
    void aSellerMaySettleARefundRequestWithAReplacement() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        patchOk(sellerCookie, request, """
                {"status":"APPROVED","resolution":"REPLACEMENT"}""")
                .andExpect(jsonPath("$.resolution").value("REPLACEMENT"))
                // What the buyer asked for is not overwritten.
                .andExpect(jsonPath("$.requestedResolution").value("REFUND"));

        patchOk(sellerCookie, request, """
                {"status":"REPLACEMENT_SENT"}""")
                .andExpect(jsonPath("$.status").value("REPLACEMENT_SENT"));
    }

    /** Sending a replacement on a request still being settled as money is refused. */
    @Test
    void sendingAReplacementOnARefundResolutionIs422() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        patchOk(sellerCookie, request, """
                {"status":"APPROVED"}""");

        mockMvc.perform(patch(ONE, request).cookie(sellerCookie)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"REPLACEMENT_SENT"}"""))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.title").value("Not a replacement"));
    }

    /** Declining without a reason is refused: the buyer is shown it. */
    @Test
    void decliningWithoutAReasonIs422() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        mockMvc.perform(patch(ONE, request).cookie(fixture.sellerCookie(seller))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"DECLINED"}"""))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("declineReason"));
    }

    /** Skipping a step is a 409, not a silent success. */
    @Test
    void jumpingStraightToRefundedIs409() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        mockMvc.perform(patch(ONE, request).cookie(fixture.sellerCookie(seller))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"REFUNDED"}"""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Illegal transition"));
    }

    /** A seller cannot cancel on the buyer's behalf. */
    @Test
    void aSellerCannotCancel() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        mockMvc.perform(patch(ONE, request).cookie(fixture.sellerCookie(seller))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"CANCELLED"}"""))
                .andExpect(status().isConflict());
    }

    // -------------------------------------------------------------------- amounts

    /** A partial refund is legitimate and is stored exactly as approved. */
    @Test
    void aPartialAmountIsApprovedAsGiven() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora One Headphones", "149.00", 2));
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 2, "REFUND");

        patchOk(fixture.sellerCookie(seller), request, """
                {"status":"AWAITING_RETURN","approvedAmount":112.00}""")
                .andExpect(jsonPath("$.requestedAmount").value(298.00))
                .andExpect(jsonPath("$.approvedAmount").value(112.00));

        assertThat(requests.findById(request).orElseThrow().getApprovedAmount())
                .isEqualByComparingTo("112.00");
    }

    /** An over-refund is not. This is the guard the brief singles out. */
    @Test
    void approvingMoreThanWasRequestedIs422() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora One Headphones", "149.00", 1));
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        mockMvc.perform(patch(ONE, request).cookie(fixture.sellerCookie(seller))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"AWAITING_RETURN","approvedAmount":500.00}"""))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.title").value("More than was requested"))
                .andExpect(jsonPath("$.errors[0].field").value("approvedAmount"));

        // Nothing was written: the request is still waiting on a decision.
        assertThat(requests.findById(request).orElseThrow().getStatus())
                .isEqualTo(RefundStatus.REQUESTED);
    }

    /** Zero or below is never an amount, on any transition. */
    @Test
    void approvingZeroIs422() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        mockMvc.perform(patch(ONE, request).cookie(fixture.sellerCookie(seller))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"AWAITING_RETURN","approvedAmount":0}"""))
                .andExpect(status().isUnprocessableEntity());
    }

    /** Omitting the amount approves the whole of what was asked for. */
    @Test
    void omittingTheAmountApprovesTheFullRequest() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 3));
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 3, "REFUND");

        patchOk(fixture.sellerCookie(seller), request, """
                {"status":"AWAITING_RETURN"}""")
                .andExpect(jsonPath("$.approvedAmount").value(297.00));
    }

    // ----------------------------------------------------------------------- undo

    /**
     * "Undo approval", which the Seller Refunds design puts beside the release
     * button. The approval's own facts go with it - an amount or a return label left
     * behind would outlive the decision that set them.
     */
    @Test
    void undoingAnApprovalClearsWhatTheApprovalSet() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora One Headphones", "149.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        patchOk(sellerCookie, request, """
                {"status":"AWAITING_RETURN","approvedAmount":100.00,
                 "returnTrackingNumber":"AZ-RET-11111","resolution":"REPLACEMENT"}""");

        patchOk(sellerCookie, request, """
                {"status":"REQUESTED","note":"Approved the wrong one."}""")
                .andExpect(jsonPath("$.status").value("REQUESTED"))
                .andExpect(jsonPath("$.approvedAmount").doesNotExist())
                .andExpect(jsonPath("$.approvedAt").doesNotExist())
                .andExpect(jsonPath("$.returnTrackingNumber").doesNotExist())
                // The buyer's original ask stands again.
                .andExpect(jsonPath("$.resolution").value("REFUND"))
                // The undo is itself a step of the history; nothing is erased.
                .andExpect(jsonPath("$.events.length()").value(3))
                .andExpect(jsonPath("$.events[2].status").value("REQUESTED"))
                .andExpect(jsonPath("$.events[2].note").value("Approved the wrong one."));

        // And it can be approved again, for a different amount.
        patchOk(sellerCookie, request, """
                {"status":"AWAITING_RETURN","approvedAmount":149.00}""")
                .andExpect(jsonPath("$.approvedAmount").value(149.00));
    }

    /**
     * Undo stops at the return: once the buyer has posted the item back, unwinding
     * the approval would strand it.
     */
    @Test
    void anApprovalCannotBeUndoneOnceTheReturnHasArrived() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        patchOk(sellerCookie, request, """
                {"status":"AWAITING_RETURN"}""");
        patchOk(sellerCookie, request, """
                {"status":"RETURN_RECEIVED"}""");

        mockMvc.perform(patch(ONE, request).cookie(sellerCookie)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"REQUESTED"}"""))
                .andExpect(status().isConflict());
    }

    /** An undone request holds its line again, so no second request can slip in. */
    @Test
    void anUndoneApprovalKeepsItsLineLocked() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");

        patchOk(fixture.sellerCookie(seller), request, """
                {"status":"AWAITING_RETURN"}""");
        patchOk(fixture.sellerCookie(seller), request, """
                {"status":"REQUESTED"}""");

        assertThat(refundLines.findByOrderLineIdInAndOpenIsTrue(List.of(order.lineId(0))))
                .hasSize(1);
    }

    // ------------------------------------------------- the DERIVED order status

    /**
     * The decision the brief singles out: REFUNDED on an order is derived from a
     * settled refund request and is never declared by a client.
     *
     * Asserted through refunds.api.OrderRefundQuery, which is the interface the order
     * feature reads it from - and asserted to be FALSE for a replacement, which is
     * settled but moved a parcel rather than money.
     */
    @Test
    void anOrderIsDerivedRefundedOnlyOnceItsRequestIsRefunded() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora One Headphones", "149.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");
        Set<UUID> ids = Set.of(order.id());

        assertThat(orderRefundQuery.refundedOrderIds(ids)).isEmpty();
        assertThat(orderRefundQuery.orderIdsWithOpenRefund(ids)).containsExactly(order.id());
        assertThat(orderRefundQuery.openRefundByOrderId(ids).get(order.id()).status())
                .isEqualTo("REQUESTED");

        patchOk(sellerCookie, request, """
                {"status":"AWAITING_RETURN"}""");
        assertThat(orderRefundQuery.refundedOrderIds(ids)).isEmpty();

        patchOk(sellerCookie, request, """
                {"status":"RETURN_RECEIVED"}""");
        assertThat(orderRefundQuery.refundedOrderIds(ids)).isEmpty();

        patchOk(sellerCookie, request, """
                {"status":"REFUNDED"}""");
        assertThat(orderRefundQuery.refundedOrderIds(ids)).containsExactly(order.id());
        // Settled, so no longer open.
        assertThat(orderRefundQuery.orderIdsWithOpenRefund(ids)).isEmpty();
        assertThat(orderRefundQuery.refundsForOrder(order.id()))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.refunded()).isTrue();
                    assertThat(view.open()).isFalse();
                });
    }

    /** A replacement is settled but is NOT a refund, and must not flip the order. */
    @Test
    void aReplacementDoesNotMakeTheOrderRefunded() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        UUID request = created(fixture.buyerCookie(buyer), order, 0, 1, "REPLACEMENT");

        patchOk(sellerCookie, request, """
                {"status":"APPROVED"}""");
        patchOk(sellerCookie, request, """
                {"status":"REPLACEMENT_SENT"}""");

        assertThat(orderRefundQuery.refundedOrderIds(Set.of(order.id()))).isEmpty();
        assertThat(orderRefundQuery.refundsForOrder(order.id()))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.refunded()).isFalse();
                    assertThat(view.open()).isFalse();
                });
    }

    /**
     * A declined request releases its units; a refunded one keeps them. This is what
     * an order's canRequestRefund reads to know whether anything is still returnable.
     */
    @Test
    void claimedQuantitiesCountSettledRefundsAndReleaseDeclinedOnes() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 3));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        List<UUID> line = List.of(order.lineId(0));

        UUID first = created(fixture.buyerCookie(buyer), order, 0, 1, "REFUND");
        assertThat(orderRefundQuery.claimedQuantityByOrderLineId(line)).containsEntry(order.lineId(0), 1);

        patchOk(sellerCookie, first, """
                {"status":"DECLINED","declineReason":"Outside the 30-day return window"}""");
        assertThat(orderRefundQuery.claimedQuantityByOrderLineId(line)).isEmpty();

        UUID second = created(fixture.buyerCookie(buyer), order, 0, 2, "REFUND");
        patchOk(sellerCookie, second, """
                {"status":"AWAITING_RETURN"}""");
        patchOk(sellerCookie, second, """
                {"status":"RETURN_RECEIVED"}""");
        patchOk(sellerCookie, second, """
                {"status":"REFUNDED"}""");
        assertThat(orderRefundQuery.claimedQuantityByOrderLineId(line)).containsEntry(order.lineId(0), 2);

        // One unit of three is left, so one more may be asked for and two may not.
        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 2, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isUnprocessableEntity());
        mockMvc.perform(post(REFUNDS).cookie(fixture.buyerCookie(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(0), 1, "REFUND", "ORIGINAL_PAYMENT")))
                .andExpect(status().isCreated());
    }

    /**
     * The one call the buyer's order feature makes: refundsByOrderIds.
     *
     * Pinned as a test because six fields on two endpoints are built from it - the
     * summary's openRefundRequestId/openRefundStatus, each LINE's
     * refundRequestId/refundStatus, the detail's refundRequests array, the derived
     * REFUNDED status, the Refunds facet bucket and half of canRequestRefund - and
     * because orderLineIds is the part that is easy to get wrong: a request covers
     * what the buyer ticked, not the whole order.
     */
    @Test
    void refundsByOrderIdsCarriesTheCoveredLineIdsAndTheOpenFlag() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer,
                LineSpec.of("Aurora One Headphones", "149.00", 1),
                LineSpec.of("Aurora Travel Case", "29.00", 1));
        Cookie buyerCookie = fixture.buyerCookie(buyer);

        // One request against the FIRST line only, so the second line must come back
        // uncovered rather than tagged with it.
        UUID request = created(buyerCookie, order, 0, 1, "REFUND");

        Map<UUID, List<OrderRefundSnapshot>> byOrder =
                orderRefundQuery.refundsByOrderIds(List.of(order.id()));

        assertThat(byOrder).containsOnlyKeys(order.id());
        assertThat(byOrder.get(order.id())).singleElement().satisfies(snapshot -> {
            assertThat(snapshot.id()).isEqualTo(request);
            assertThat(snapshot.reference()).startsWith("ref_");
            assertThat(snapshot.status()).isEqualTo("REQUESTED");
            assertThat(snapshot.resolution()).isEqualTo("REFUND");
            assertThat(snapshot.requestedAmount()).isEqualByComparingTo("149.00");
            assertThat(snapshot.approvedAmount()).isNull();
            assertThat(snapshot.currency()).isEqualTo("USD");
            assertThat(snapshot.open()).isTrue();
            assertThat(snapshot.refunded()).isFalse();
            // Exactly the line the buyer ticked.
            assertThat(snapshot.orderLineIds()).containsExactly(order.lineId(0));
            assertThat(snapshot.orderLineIds()).doesNotContain(order.lineId(1));
        });

        // An order nobody has raised anything against is absent, not mapped to an
        // empty list - the caller's getOrDefault handles it either way, and an absent
        // key is the cheaper answer.
        SeededOrder untouched = fixture.order(seller, buyer, LineSpec.of("Aurora Buds", "99.00", 1));
        assertThat(orderRefundQuery.refundsByOrderIds(List.of(untouched.id()))).isEmpty();
        assertThat(orderRefundQuery.refundsByOrderIds(List.of())).isEmpty();
    }

    /**
     * The return window, read through the interface the order detail's
     * refundWindowEndsAt uses, so both sides of "server-owned" give one answer.
     */
    @Test
    void theRefundWindowPolicyIsTheSameOneThePostEnforces() {
        Instant placed = Instant.parse("2026-09-01T00:00:00Z");
        assertThat(refundWindowPolicy.endsAt(placed)).isEqualTo(Instant.parse("2026-10-01T00:00:00Z"));
        assertThat(refundWindowPolicy.isOpenAt(placed, Instant.parse("2026-09-30T23:59:59Z"))).isTrue();
        // The boundary instant itself is inside the window, which is the reading a
        // buyer would expect of "30 days".
        assertThat(refundWindowPolicy.isOpenAt(placed, Instant.parse("2026-10-01T00:00:00Z"))).isTrue();
        assertThat(refundWindowPolicy.isOpenAt(placed, Instant.parse("2026-10-01T00:00:01Z"))).isFalse();
    }

    // ------------------------------------------------------------ the buyer's list

    /** The buyer's own list, and only theirs. */
    @Test
    void theBuyersListShowsOnlyTheirOwnRequests() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity mine = fixture.buyer();
        BuyerIdentity theirs = fixture.buyer();
        SeededOrder myOrder = fixture.order(seller, mine, LineSpec.of("Aurora Buds", "99.00", 1));
        SeededOrder theirOrder = fixture.order(seller, theirs, LineSpec.of("Aurora Buds", "99.00", 1));

        created(fixture.buyerCookie(mine), myOrder, 0, 1, "REFUND");
        created(fixture.buyerCookie(theirs), theirOrder, 0, 1, "REFUND");

        mockMvc.perform(get(REFUNDS).cookie(fixture.buyerCookie(mine)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].orderId").value(myOrder.id().toString()))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1));
    }

    /** ?status= narrows it. */
    @Test
    void theBuyersListFiltersByStatus() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer,
                LineSpec.of("Aurora Buds", "99.00", 1),
                LineSpec.of("Aurora Travel Case", "29.00", 1));
        Cookie buyerCookie = fixture.buyerCookie(buyer);

        created(buyerCookie, order, 0, 1, "REFUND");
        UUID second = created(buyerCookie, order, 1, 1, "REFUND");
        patchOk(fixture.sellerCookie(seller), second, """
                {"status":"DECLINED","declineReason":"Fault not reproducible"}""");

        mockMvc.perform(get(REFUNDS).cookie(buyerCookie).param("status", "DECLINED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].status").value("DECLINED"));
    }

    // ---------------------------------------------------------------- unknown ids

    /** An id that does not exist reads the same as one that is not yours. */
    @Test
    void anUnknownRequestIs404() throws Exception {
        mockMvc.perform(get(ONE, UUID.randomUUID()).cookie(fixture.buyerCookie(fixture.buyer())))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------- helpers

    private String createBody(
            UUID orderId, UUID lineId, int quantity, String resolution, String payout) {
        return """
                {"orderId":"%s","lines":[{"orderLineId":"%s","quantity":%d}],
                 "resolution":"%s","payout":%s,"detail":"%s"}
                """.formatted(
                orderId, lineId, quantity, resolution,
                payout == null ? "null" : "\"" + payout + "\"", DETAIL);
    }

    /** Raises a request and returns its id. */
    private UUID created(Cookie buyerCookie, SeededOrder order, int lineIndex, int quantity, String resolution)
            throws Exception {
        MvcResult result = mockMvc.perform(post(REFUNDS).cookie(buyerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(order.id(), order.lineId(lineIndex), quantity, resolution,
                                resolution.equals("REFUND") ? "ORIGINAL_PAYMENT" : null)))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.id"));
    }

    private org.springframework.test.web.servlet.ResultActions patchOk(
            Cookie cookie, UUID requestId, String body) throws Exception {
        return mockMvc.perform(patch(ONE, requestId).cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }
}
