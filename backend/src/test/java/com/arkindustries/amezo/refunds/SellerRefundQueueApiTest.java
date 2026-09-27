package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.identity.BuyerIdentity;
import com.arkindustries.amezo.identity.IdentityType;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SessionRepository;
import com.arkindustries.amezo.refunds.RefundFixture.LineSpec;
import com.arkindustries.amezo.refunds.RefundFixture.SeededOrder;
import com.arkindustries.amezo.support.Fixtures;
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

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The seller's refund queue: GET /api/v1/sellers/me/refund-requests and its facets.
 *
 * A class of its own, not more cases on RefundRequestApiTest, because these two
 * endpoints are read-only and seller-scoped where those are the resource and its
 * state machine - and because the queue's assertions are about which rows come back
 * for whom, which is clearest when the class seeds nothing else.
 *
 * Every fixture is uniquely named (see RefundFixture) so these pass in any order,
 * and every assertion about counts is scoped to one freshly-created seller rather
 * than to the table - a queue test that counted every refund in the database would
 * depend on which other test ran first.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Import(RefundFixture.class)
class SellerRefundQueueApiTest {

    private static final String QUEUE = "/api/v1/sellers/me/refund-requests";
    private static final String FACETS = QUEUE + "/facets";
    private static final String DETAIL =
            "The left earcup stopped producing sound about a week after delivery.";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired private MockMvc mockMvc;
    @Autowired private RefundFixture fixture;
    @Autowired private SessionRepository sessions;

    /**
     * The headline behaviour, and the isolation that matters most: one seller's queue
     * never contains another's request, even on the same order.
     */
    @Test
    void theQueueShowsOnlyThisSellersRequests() throws Exception {
        Seller mine = fixture.seller();
        Seller other = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();

        SeededOrder myOrder = fixture.order(mine, buyer, LineSpec.of("Aurora One Headphones", "149.00", 1));
        SeededOrder theirOrder = fixture.order(other, buyer, LineSpec.of("Someone Else's Cable", "19.00", 1));
        Cookie buyerCookie = fixture.buyerCookie(buyer);
        raise(buyerCookie, myOrder);
        raise(buyerCookie, theirOrder);

        mockMvc.perform(get(QUEUE).cookie(fixture.sellerCookie(mine)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].orderId").value(myOrder.id().toString()))
                .andExpect(jsonPath("$.content[0].status").value("REQUESTED"))
                .andExpect(jsonPath("$.content[0].requestedAmount").value(149.00))
                // The design's table prints the buyer and the items, so the row
                // carries both rather than being a line of reference codes.
                .andExpect(jsonPath("$.content[0].buyerName").value("Jonas Lindqvist"))
                .andExpect(jsonPath("$.content[0].buyerEmail").value(buyer.getEmail()))
                .andExpect(jsonPath("$.content[0].items").value("1 × Aurora One Headphones"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.page").value(0));

        mockMvc.perform(get(QUEUE).cookie(fixture.sellerCookie(other)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].orderId").value(theirOrder.id().toString()));
    }

    /** ?status= is a RefundStatus, which is also what the facets key their counts by. */
    @Test
    void theQueueFiltersByStatus() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer,
                LineSpec.of("Aurora One Headphones", "149.00", 1),
                LineSpec.of("Aurora Travel Case", "29.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        Cookie buyerCookie = fixture.buyerCookie(buyer);

        raise(buyerCookie, order, 0);
        UUID approved = raise(buyerCookie, order, 1);
        mockMvc.perform(patch("/api/v1/refund-requests/{id}", approved).cookie(sellerCookie)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"AWAITING_RETURN"}"""))
                .andExpect(status().isOk());

        mockMvc.perform(get(QUEUE).cookie(sellerCookie).param("status", "REQUESTED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].status").value("REQUESTED"));

        mockMvc.perform(get(QUEUE).cookie(sellerCookie).param("status", "AWAITING_RETURN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(approved.toString()));
    }

    /**
     * ?q= matches all four of what the contract says it matches. Three of the four are
     * in other features, which is why the term is applied to assembled text rather
     * than in SQL - so each one is worth a case.
     */
    @Test
    void theQueueSearchesBuyerNameEmailProductTitleAndReference() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora One Headphones", "149.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        UUID request = raise(fixture.buyerCookie(buyer), order);

        // The buyer's name, from identity.
        mockMvc.perform(get(QUEUE).cookie(sellerCookie).param("q", "lindqvist"))
                .andExpect(jsonPath("$.content.length()").value(1));
        // Their email, from the order's snapshot.
        mockMvc.perform(get(QUEUE).cookie(sellerCookie).param("q", buyer.getEmail()))
                .andExpect(jsonPath("$.content.length()").value(1));
        // The product title, from catalog.
        mockMvc.perform(get(QUEUE).cookie(sellerCookie).param("q", "headphones"))
                .andExpect(jsonPath("$.content.length()").value(1));
        // And the request's own reference, case-insensitively.
        String reference = JsonPath.read(
                mockMvc.perform(get("/api/v1/refund-requests/{id}", request).cookie(sellerCookie))
                        .andReturn().getResponse().getContentAsString(),
                "$.reference");
        mockMvc.perform(get(QUEUE).cookie(sellerCookie).param("q", reference.toUpperCase()))
                .andExpect(jsonPath("$.content.length()").value(1));

        mockMvc.perform(get(QUEUE).cookie(sellerCookie).param("q", "nothing-matches-this"))
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0))
                // An empty list is one empty page, not zero - "Page 1 of 0" is what
                // the frontend prints otherwise.
                .andExpect(jsonPath("$.totalPages").value(1));
    }

    /** Paging is real, not a shape the response happens to have. */
    @Test
    void theQueuePages() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer,
                LineSpec.of("Aurora One Headphones", "149.00", 1),
                LineSpec.of("Aurora Travel Case", "29.00", 1),
                LineSpec.of("Aurora Buds", "99.00", 1));
        Cookie buyerCookie = fixture.buyerCookie(buyer);
        raise(buyerCookie, order, 0);
        raise(buyerCookie, order, 1);
        raise(buyerCookie, order, 2);

        Cookie sellerCookie = fixture.sellerCookie(seller);
        mockMvc.perform(get(QUEUE).cookie(sellerCookie).param("size", "2").param("page", "0"))
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2));

        mockMvc.perform(get(QUEUE).cookie(sellerCookie).param("size", "2").param("page", "1"))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.page").value(1));
    }

    /**
     * The facets: a count and a money total per bucket, keyed by what the list takes.
     *
     * The status is deliberately ignored - a strip that counted only the tab being
     * viewed would report zero for every other one, which is the one thing a tab
     * strip must not do.
     */
    @Test
    void theFacetsCountEveryBucketAndTotalTheMoney() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer,
                LineSpec.of("Aurora One Headphones", "149.00", 1),
                LineSpec.of("Aurora Travel Case", "29.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        Cookie buyerCookie = fixture.buyerCookie(buyer);

        raise(buyerCookie, order, 0);
        UUID declined = raise(buyerCookie, order, 1);
        mockMvc.perform(patch("/api/v1/refund-requests/{id}", declined).cookie(sellerCookie)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"status":"DECLINED","declineReason":"Item shows signs of use"}"""))
                .andExpect(status().isOk());

        mockMvc.perform(get(FACETS).cookie(sellerCookie))
                .andExpect(status().isOk())
                // The design's tabs, in order, plus "all".
                .andExpect(jsonPath("$.facets[0].key").value("REQUESTED"))
                .andExpect(jsonPath("$.facets[0].count").value(1))
                .andExpect(jsonPath("$.facets[0].value").value(149.00))
                .andExpect(jsonPath("$.facets[0].currency").value("USD"))
                // APPROVED has a bucket of its own: a replacement approved but not
                // yet sent would otherwise show in no tab but "all".
                .andExpect(jsonPath("$.facets[1].key").value("APPROVED"))
                .andExpect(jsonPath("$.facets[2].key").value("AWAITING_RETURN"))
                .andExpect(jsonPath("$.facets[2].count").value(0))
                // An empty bucket is zero dollars at stake, which is true and useful -
                // not null, which would mean "no meaningful total".
                .andExpect(jsonPath("$.facets[2].value").value(0))
                .andExpect(jsonPath("$.facets[6].key").value("DECLINED"))
                .andExpect(jsonPath("$.facets[6].count").value(1))
                .andExpect(jsonPath("$.facets[7].key").value("all"))
                .andExpect(jsonPath("$.facets[7].count").value(2))
                .andExpect(jsonPath("$.facets[7].value").value(178.00));
    }

    /** The search narrows the counts with the list; the status does not. */
    @Test
    void theFacetsHonourTheSearchAndIgnoreTheStatus() throws Exception {
        Seller seller = fixture.seller();
        BuyerIdentity buyer = fixture.buyer();
        SeededOrder order = fixture.order(seller, buyer, LineSpec.of("Aurora One Headphones", "149.00", 1));
        Cookie sellerCookie = fixture.sellerCookie(seller);
        raise(fixture.buyerCookie(buyer), order);

        mockMvc.perform(get(FACETS).cookie(sellerCookie).param("q", "headphones"))
                .andExpect(jsonPath("$.facets[7].count").value(1));

        mockMvc.perform(get(FACETS).cookie(sellerCookie).param("q", "nothing-matches-this"))
                .andExpect(jsonPath("$.facets[7].count").value(0));

        // A status parameter is accepted and has no effect, which is what lets the
        // frontend send its current tab without zeroing the other six.
        mockMvc.perform(get(FACETS).cookie(sellerCookie).param("status", "DECLINED"))
                .andExpect(jsonPath("$.facets[0].count").value(1));
    }

    /** The queue is seller-only, and a buyer session is not a seller session. */
    @Test
    void theQueueRefusesBuyersAndAnonymousCallers() throws Exception {
        mockMvc.perform(get(QUEUE)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(FACETS)).andExpect(status().isUnauthorized());

        // A REAL buyer_identity, not a session over a random uuid. The filter reads the
        // row now (one address, both roles - identity/AccountIdentities), so a session
        // naming nobody authenticates as nobody and answers 401 - which would have made
        // the two assertions below pass for the wrong reason.
        Cookie buyerCookie = fixture.buyerCookie(fixture.buyer());
        mockMvc.perform(get(QUEUE).cookie(buyerCookie)).andExpect(status().isForbidden());
        mockMvc.perform(get(FACETS).cookie(buyerCookie)).andExpect(status().isForbidden());
    }

    /** A seller with nothing waiting gets an empty page and zeroed buckets, not a 404. */
    @Test
    void aSellerWithNoRefundsGetsAnEmptyQueue() throws Exception {
        Cookie sellerCookie = fixture.sellerCookie(fixture.seller());

        mockMvc.perform(get(QUEUE).cookie(sellerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.totalPages").value(1));

        mockMvc.perform(get(FACETS).cookie(sellerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.facets.length()").value(8))
                .andExpect(jsonPath("$.facets[7].count").value(0));
    }

    // ------------------------------------------------------------------- helpers

    private UUID raise(Cookie buyerCookie, SeededOrder order) throws Exception {
        return raise(buyerCookie, order, 0);
    }

    private UUID raise(Cookie buyerCookie, SeededOrder order, int lineIndex) throws Exception {
        String body = """
                {"orderId":"%s","lines":[{"orderLineId":"%s","quantity":1}],
                 "resolution":"REFUND","payout":"ORIGINAL_PAYMENT","detail":"%s"}
                """.formatted(order.id(), order.lineId(lineIndex), DETAIL);

        MvcResult result = mockMvc.perform(post("/api/v1/refund-requests").cookie(buyerCookie)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.id"));
    }
}
