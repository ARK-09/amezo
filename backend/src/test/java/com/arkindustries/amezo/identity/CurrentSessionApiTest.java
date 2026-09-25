package com.arkindustries.amezo.identity;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /sessions/current. It had a SecurityConfig rule and no controller, so an
 * authenticated caller got a 404 - which is what the deployed frontend was
 * seeing on every page load. These cases pin both halves: the route exists, and
 * every "no usable session" variant is a 401 (the frontend's "not signed in"
 * signal) rather than a 404, a 403, or a 500.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class CurrentSessionApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private SellerRepository sellerRepository;

    @MockitoBean
    private EmailSender emailSender;

    private static final Pattern TOKEN_PATTERN = Pattern.compile("token=([^&\\s]+)");

    @Test
    void returnsTheSignedInSellerIdentity() throws Exception {
        Cookie session = signIn("current1@example.com");

        mockMvc.perform(get("/sessions/current").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.identityType").value("SELLER"))
                .andExpect(jsonPath("$.email").value("current1@example.com"))
                .andExpect(jsonPath("$.identityId").value(
                        sellerRepository.findByEmail("current1@example.com").orElseThrow().getId().toString()))
                .andExpect(jsonPath("$.expiresAt").isNotEmpty());
    }

    /**
     * The case the production 404 was hiding: an anonymous visitor. 401 is the
     * answer, with the same ProblemDetail body as every other error - the
     * frontend reads it as "nobody is signed in", not as a failure.
     */
    @Test
    void returns401WithNoCookie() throws Exception {
        mockMvc.perform(get("/sessions/current"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.type").value("https://api/errors/unauthorized"));
    }

    @Test
    void returns401ForAGarbageCookie() throws Exception {
        mockMvc.perform(get("/sessions/current").cookie(new Cookie("mp_session", "not-a-real-session")))
                .andExpect(status().isUnauthorized());
    }

    /** A cookie the browser still holds for a session row that has aged out. */
    @Test
    void returns401ForAnExpiredSession() throws Exception {
        Cookie session = signIn("current2@example.com");
        Session row = sessionRepository.findAll().stream()
                .filter(s -> s.getExpiresAt().isAfter(Instant.now()))
                .findFirst()
                .orElseThrow();
        row.setExpiresAt(Instant.now().minus(1, ChronoUnit.MINUTES));
        sessionRepository.save(row);

        mockMvc.perform(get("/sessions/current").cookie(session))
                .andExpect(status().isUnauthorized());
    }

    /** Sign-out revokes the row server-side, so the same cookie stops working. */
    @Test
    void returns401AfterSignOut() throws Exception {
        Cookie session = signIn("current3@example.com");

        mockMvc.perform(get("/sessions/current").cookie(session)).andExpect(status().isOk());
        mockMvc.perform(delete("/auth/seller/session").cookie(session)).andExpect(status().isNoContent());

        mockMvc.perform(get("/sessions/current").cookie(session))
                .andExpect(status().isUnauthorized());
    }

    /**
     * DELETE /sessions/current used to have a security rule and no controller.
     * The rule is gone, so it is now plainly not a route - 403 from
     * anyRequest().denyAll(), the same as any other path the API doesn't serve,
     * instead of a 404 that looked like a broken endpoint.
     */
    @Test
    void deleteSessionsCurrentIsNotARoute() throws Exception {
        Cookie session = signIn("current4@example.com");

        mockMvc.perform(delete("/sessions/current").cookie(session))
                .andExpect(status().isForbidden());
    }

    private Cookie signIn(String email) throws Exception {
        mockMvc.perform(post("/auth/seller/magic-link")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent());

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailSender).send(eq(email), anyString(), bodyCaptor.capture());
        Matcher matcher = TOKEN_PATTERN.matcher(bodyCaptor.getValue());
        assertThat(matcher.find()).as("email body should contain a token= link").isTrue();

        MvcResult result = mockMvc.perform(post("/auth/seller/verify")
                        .contentType("application/json")
                        .content("{\"token\":\"" + matcher.group(1) + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie cookie = result.getResponse().getCookie("mp_session");
        assertThat(cookie).isNotNull();
        return cookie;
    }
}
