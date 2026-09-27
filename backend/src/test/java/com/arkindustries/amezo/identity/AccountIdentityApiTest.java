package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.support.Fixtures;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * One email address is one account, and it may buy and sell.
 *
 * <h2>What was wrong</h2>
 *
 * Buyers and sellers live in two tables, each with its own unique email, so the same
 * address could always appear in both. Nothing joined them: a session named ONE row
 * and granted ONE role, and there is only one session cookie - so signing into the
 * seller portal replaced a buyer's session outright. The same person could sell or
 * buy and never both, and GET /api/v1/orders answered 403 to a seller who had bought
 * something an hour earlier.
 *
 * <h2>What these tests pin</h2>
 *
 * Role grants come from the identities the session's verified ADDRESS owns
 * ({@link AccountIdentities}), not from the session's own identity_type. So the
 * interesting cases are the asymmetric ones: a session that reaches BOTH namespaces,
 * and a session that must still be refused one of them.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AccountIdentityApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    /** A seller-only route, and a buyer-only one. Neither is reachable by the other role. */
    private static final String SELLER_ROUTE = "/api/v1/sellers/me/orders";
    private static final String BUYER_ROUTE = "/api/v1/orders";

    @Autowired private MockMvc mockMvc;

    @Autowired private SellerRepository sellers;
    @Autowired private BuyerIdentityRepository buyers;
    @Autowired private SessionRepository sessions;

    /** Mocked so the magic-link tests below capture the token instead of sending mail. */
    @MockitoBean private EmailSender emailSender;

    /**
     * The headline: one address, both namespaces, from whichever door they came in by.
     *
     * Asserted for BOTH primary types, because the fix is not "a seller session also
     * gets the buyer role" - it is that the primary type stops deciding. A session
     * minted by a buyer link on an address that also sells reaches the portal too, and
     * that direction is the one a type check would have got wrong in the other way.
     */
    @Test
    void oneAddressReachesBothNamespacesWhicheverDoorItSignedInThrough() throws Exception {
        String email = "both-" + UUID.randomUUID() + "@example.com";
        Seller seller = sellers.save(Seller.builder().email(email).build());
        BuyerIdentity buyer = buyers.save(BuyerIdentity.builder()
                .email(email).fullName("Both Halves").build());

        Cookie sellerPrimary = Fixtures.sessionCookie(sessions, IdentityType.SELLER, seller.getId());
        mockMvc.perform(get(SELLER_ROUTE).cookie(sellerPrimary)).andExpect(status().isOk());
        mockMvc.perform(get(BUYER_ROUTE).cookie(sellerPrimary)).andExpect(status().isOk());

        Cookie buyerPrimary = Fixtures.sessionCookie(sessions, IdentityType.BUYER, buyer.getId());
        mockMvc.perform(get(BUYER_ROUTE).cookie(buyerPrimary)).andExpect(status().isOk());
        mockMvc.perform(get(SELLER_ROUTE).cookie(buyerPrimary)).andExpect(status().isOk());
    }

    /**
     * /sessions/current reports the door AND both ids.
     *
     * The ids are what a client must branch on. identityType is still the honest answer
     * to "signed in as", but a screen that read it as the list of things the session may
     * do hid My Orders from people who had orders.
     */
    @Test
    void theSessionReportsEveryIdentityItsAddressOwns() throws Exception {
        String email = "both-" + UUID.randomUUID() + "@example.com";
        Seller seller = sellers.save(Seller.builder().email(email).build());
        BuyerIdentity buyer = buyers.save(BuyerIdentity.builder()
                .email(email).fullName("Both Halves").build());

        mockMvc.perform(get("/sessions/current")
                        .cookie(Fixtures.sessionCookie(sessions, IdentityType.SELLER, seller.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.identityType").value("SELLER"))
                .andExpect(jsonPath("$.identityId").value(seller.getId().toString()))
                .andExpect(jsonPath("$.sellerId").value(seller.getId().toString()))
                .andExpect(jsonPath("$.buyerIdentityId").value(buyer.getId().toString()));
    }

    /**
     * Selling is not granted by signing in.
     *
     * A buyer whose address has no seller row is still refused the portal - 403, because
     * they ARE signed in, just not as a seller. Nothing about joining the two halves may
     * hand someone a storefront they never asked for.
     */
    @Test
    void aBuyerWhoseAddressDoesNotSellIsStillRefusedTheSellerNamespace() throws Exception {
        BuyerIdentity buyer = buyers.save(BuyerIdentity.builder()
                .email("buyer-only-" + UUID.randomUUID() + "@example.com")
                .fullName("Buyer Only")
                .build());

        Cookie cookie = Fixtures.sessionCookie(sessions, IdentityType.BUYER, buyer.getId());
        mockMvc.perform(get(BUYER_ROUTE).cookie(cookie)).andExpect(status().isOk());
        mockMvc.perform(get(SELLER_ROUTE).cookie(cookie)).andExpect(status().isForbidden());
    }

    /**
     * Two DIFFERENT addresses stay two accounts.
     *
     * The join is on the whole address and nothing else, so a seller at one address gets
     * no reach over a buyer at another - which is what stops "one account" from meaning
     * "anybody who sells can read somebody's orders".
     */
    @Test
    void aSellerAtOneAddressIsNotTheBuyerAtAnother() throws Exception {
        Seller seller = sellers.save(Seller.builder()
                .email("shop-" + UUID.randomUUID() + "@example.com").build());
        buyers.save(BuyerIdentity.builder()
                .email("someone-else-" + UUID.randomUUID() + "@example.com")
                .fullName("Someone Else")
                .build());

        Cookie cookie = Fixtures.sessionCookie(sessions, IdentityType.SELLER, seller.getId());
        mockMvc.perform(get(SELLER_ROUTE).cookie(cookie)).andExpect(status().isOk());
        // No buyer row under the seller's own address, so no buyer role - and the other
        // buyer's address is irrelevant to it.
        mockMvc.perform(get(BUYER_ROUTE).cookie(cookie)).andExpect(status().isForbidden());
    }

    /**
     * Verifying a seller link fills in the buyer half, so a seller is never refused their
     * own order history.
     *
     * Deliberately not symmetrical: a buyer sign-in mints no seller row, which the test
     * below asserts. Buying needs no opt-in; selling means a storefront with a public
     * handle on it, and that is a decision a person makes rather than one a sign-in makes
     * for them.
     */
    @Test
    void verifyingAsASellerAlsoMakesTheAddressABuyer() throws Exception {
        String email = "new-seller-" + UUID.randomUUID() + "@example.com";

        Cookie cookie = signInThrough("/auth/seller", email);

        assertThat(buyers.findByEmail(email)).isPresent();
        mockMvc.perform(get(BUYER_ROUTE).cookie(cookie)).andExpect(status().isOk());
        mockMvc.perform(get(SELLER_ROUTE).cookie(cookie)).andExpect(status().isOk());
    }

    @Test
    void verifyingAsABuyerDoesNotMakeTheAddressASeller() throws Exception {
        String email = "new-buyer-" + UUID.randomUUID() + "@example.com";

        Cookie cookie = signInThrough("/auth/buyer", email);

        assertThat(sellers.findByEmail(email)).isEmpty();
        mockMvc.perform(get(BUYER_ROUTE).cookie(cookie)).andExpect(status().isOk());
        mockMvc.perform(get(SELLER_ROUTE).cookie(cookie)).andExpect(status().isForbidden());
    }

    /**
     * A session whose identity row is gone names nobody.
     *
     * 401 rather than the role its type used to be trusted for: the filter reads the row
     * now, and a cookie that resolves to no identity needs the same answer as an expired
     * one - sign in again. This is also what a database restored from an older dump looks
     * like.
     */
    @Test
    void aSessionOverAnIdentityThatDoesNotExistIsUnauthorized() throws Exception {
        Cookie ghost = Fixtures.sessionCookie(sessions, IdentityType.BUYER, UUID.randomUUID());

        mockMvc.perform(get(BUYER_ROUTE).cookie(ghost)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/sessions/current").cookie(ghost)).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------ helpers

    /** The real magic-link round trip, with the token read out of the "email". */
    private Cookie signInThrough(String prefix, String email) throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post(prefix + "/magic-link")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<String> body = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(emailSender).send(eq(email), anyString(), body.capture());
        java.util.regex.Matcher matcher =
                java.util.regex.Pattern.compile("token=([^&\\s]+)").matcher(body.getValue());
        assertThat(matcher.find()).as("the email should carry a token= link").isTrue();

        MvcResult verified = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post(prefix + "/verify")
                        .contentType("application/json")
                        .content("{\"token\":\"" + matcher.group(1) + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        // Asserted rather than assumed: every test above depends on this cookie being
        // the thing the session filter then resolves.
        assertThat((String) JsonPath.read(verified.getResponse().getContentAsString(), "$.email"))
                .isEqualTo(email);
        return verified.getResponse().getCookie(Fixtures.SESSION_COOKIE);
    }
}
