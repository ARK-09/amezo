package com.arkindustries.amezo.identity;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.jayway.jsonpath.JsonPath;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The demo address: the one email whose sign-in link comes back in the response
 * instead of being sent.
 *
 * <h2>Why it exists</h2>
 *
 * Every sign-in here is a magic link, so an instance that cannot deliver email cannot
 * let anybody in - and Resend's free tier is a sandbox until a domain is verified (it
 * delivers only to the account holder's own address) and rate limited besides. With a
 * demo address configured, walking the app needs no inbox and no provider.
 *
 * <h2>What these tests are really for</h2>
 *
 * This is the narrowest possible hole in a magic-link system, and the tests are the
 * guard on its edges rather than on the happy path. It has to be EXACTLY one address,
 * matched whole; every other address has to stay on the emailed path with nothing in
 * the body; and with nothing configured there must be no demo address at all. A
 * regression in any of those turns a demo affordance into a way to sign in as anybody.
 *
 * See {@link DemoAccount}. The account itself is public by design - anyone who knows
 * the address can sign in as it - so it is for an account holding demo data, which is
 * a fact about how it is used and not something these tests can assert.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@TestPropertySource(properties = "app.demo.email=Demo@Amezo.com")
class DemoAccountApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired private MockMvc mockMvc;
    @Autowired private MagicLinkTokenRepository tokens;

    /** So a send can be asserted NOT to have happened. */
    @MockitoBean private EmailSender emailSender;

    /**
     * The demo address gets a usable token and no email.
     *
     * It is a real magic-link token, not a parallel credential: the row is in
     * magic_link_token with the ordinary expiry, and /verify is what redeems it. That is
     * the whole design - only the delivery changes - so the single-use rule, the type
     * check and the session minting are all the code paths they already were.
     */
    @Test
    void theDemoAddressGetsItsTokenInTheResponseAndNoEmail() throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/seller/magic-link")
                        .contentType("application/json")
                        .content("{\"email\":\"demo@amezo.com\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn();

        String token = JsonPath.read(result.getResponse().getContentAsString(), "$.token");

        // Nothing was sent. Skipping the provider is the point: sending is the part that
        // fails on a spent free tier, so a demo that mailed itself a copy would be no
        // more reliable than the send.
        verify(emailSender, never()).send(anyString(), anyString(), anyString());

        // An ordinary token, redeemable through the ordinary route.
        assertThat(tokens.findAll())
                .anyMatch(row -> row.getEmail().equals("demo@amezo.com")
                        && row.getIdentityType() == IdentityType.SELLER
                        && row.getConsumedAt() == null);

        mockMvc.perform(post("/auth/seller/verify")
                        .contentType("application/json")
                        .content("{\"token\":\"" + token + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("demo@amezo.com"));

        // Still single-use.
        mockMvc.perform(post("/auth/seller/verify")
                        .contentType("application/json")
                        .content("{\"token\":\"" + token + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    /** The buyer door too, since the demo account is one account for both halves. */
    @Test
    void theBuyerDoorAnswersTheDemoAddressTheSameWay() throws Exception {
        mockMvc.perform(post("/auth/buyer/magic-link")
                        .contentType("application/json")
                        .content("{\"email\":\"demo@amezo.com\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());

        verify(emailSender, never()).send(anyString(), anyString(), anyString());
    }

    /**
     * How the address is typed does not decide who gets in.
     *
     * Configured with capitals here on purpose. An operator types it into an environment
     * variable and a person types it into a form, and those are never the same shape - a
     * demo that failed on a capital letter would be reported as the demo being broken.
     */
    @Test
    void theMatchIgnoresCaseAndSurroundingSpace() throws Exception {
        mockMvc.perform(post("/auth/seller/magic-link")
                        .contentType("application/json")
                        .content("{\"email\":\"DEMO@AMEZO.COM\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    /**
     * Every other address stays on the emailed path with NOTHING in the body.
     *
     * This is the assertion that matters most. A token returned for an arbitrary address
     * would let anyone sign in as anyone by asking, so the three cases below are each a
     * near miss of the configured value: a different local part, a different domain, and
     * the configured address as a substring of a longer one.
     */
    @Test
    void everyOtherAddressIsEmailedAndCarriesNoTokenInTheBody() throws Exception {
        for (String other : new String[] {
                "demo2@amezo.com",
                "demo@amezo.com.attacker.example",
                "demo@example.com"}) {

            mockMvc.perform(post("/auth/seller/magic-link")
                            .contentType("application/json")
                            .content("{\"email\":\"" + other + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.token").doesNotExist());

            verify(emailSender).send(eq(other), anyString(), anyString());
        }
    }

    /**
     * With nothing configured there is no demo address - not even the one this class
     * configures.
     *
     * A nested class so it gets its own context with the property absent, which is the
     * default for every deployment: unset means off, and there is no value to guess.
     */
    @SpringBootTest
    @AutoConfigureMockMvc
    @Testcontainers
    static class WithNoDemoAddressConfigured {

        @Container
        @ServiceConnection
        static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

        @Autowired private MockMvc mockMvc;
        @MockitoBean private EmailSender emailSender;

        @Test
        void noAddressGetsATokenInTheBody() throws Exception {
            mockMvc.perform(post("/auth/seller/magic-link")
                            .contentType("application/json")
                            .content("{\"email\":\"demo@amezo.com\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.token").doesNotExist());

            verify(emailSender).send(eq("demo@amezo.com"), anyString(), anyString());
        }
    }
}
