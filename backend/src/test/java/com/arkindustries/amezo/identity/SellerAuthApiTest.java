package com.arkindustries.amezo.identity;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.Cookie;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SellerAuthApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MagicLinkTokenRepository magicLinkTokenRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private SellerRepository sellerRepository;

    @MockitoBean
    private EmailSender emailSender;

    private static final Pattern TOKEN_PATTERN = Pattern.compile("token=([^&\\s]+)");

    @Test
    void requestingAMagicLinkCreatesATokenAndEmailsIt() throws Exception {
        mockMvc.perform(post("/auth/seller/magic-link")
                        .contentType("application/json")
                        .content("{\"email\":\"seller1@example.com\"}"))
                .andExpect(status().isNoContent());

        assertThat(magicLinkTokenRepository.findAll())
                .anyMatch(t -> t.getEmail().equals("seller1@example.com")
                        && t.getIdentityType() == IdentityType.SELLER
                        && t.getConsumedAt() == null
                        && t.getExpiresAt().isAfter(Instant.now()));

        verify(emailSender).send(eq("seller1@example.com"), anyString(), anyString());
    }

    @Test
    void verifyingAFreshTokenCreatesASellerAndSessionAndSetsACookie() throws Exception {
        String rawToken = requestMagicLinkAndCaptureToken("seller2@example.com");

        MvcResult result = mockMvc.perform(post("/auth/seller/verify")
                        .contentType("application/json")
                        .content("{\"token\":\"" + rawToken + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("seller2@example.com"))
                .andExpect(cookie().exists("mp_session"))
                .andExpect(cookie().httpOnly("mp_session", true))
                .andReturn();

        Cookie sessionCookie = result.getResponse().getCookie("mp_session");
        assertThat(sessionCookie).isNotNull();
        assertThat(sessionCookie.getValue()).isNotBlank();

        assertThat(sellerRepository.findByEmail("seller2@example.com")).isPresent();
        assertThat(sessionRepository.findAll())
                .anyMatch(s -> s.getIdentityType() == IdentityType.SELLER);
        assertThat(magicLinkTokenRepository.findAll())
                .filteredOn(t -> t.getEmail().equals("seller2@example.com"))
                .allMatch(t -> t.getConsumedAt() != null);
    }

    @Test
    void verifyingAnUnknownTokenReturns401() throws Exception {
        mockMvc.perform(post("/auth/seller/verify")
                        .contentType("application/json")
                        .content("{\"token\":\"not-a-real-token\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.type").value("https://api/errors/invalid-token"));
    }

    @Test
    void verifyingAnAlreadyConsumedTokenReturns401() throws Exception {
        String rawToken = requestMagicLinkAndCaptureToken("seller3@example.com");

        mockMvc.perform(post("/auth/seller/verify")
                        .contentType("application/json")
                        .content("{\"token\":\"" + rawToken + "\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/auth/seller/verify")
                        .contentType("application/json")
                        .content("{\"token\":\"" + rawToken + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void signOutDeletesTheSessionAndClearsTheCookie() throws Exception {
        String rawToken = requestMagicLinkAndCaptureToken("seller4@example.com");

        MvcResult verifyResult = mockMvc.perform(post("/auth/seller/verify")
                        .contentType("application/json")
                        .content("{\"token\":\"" + rawToken + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie sessionCookie = verifyResult.getResponse().getCookie("mp_session");

        long sessionCountBefore = sessionRepository.count();

        mockMvc.perform(delete("/auth/seller/session").cookie(sessionCookie))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge("mp_session", 0));

        assertThat(sessionRepository.count()).isEqualTo(sessionCountBefore - 1);
    }

    private String requestMagicLinkAndCaptureToken(String email) throws Exception {
        mockMvc.perform(post("/auth/seller/magic-link")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent());

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailSender).send(eq(email), anyString(), bodyCaptor.capture());

        Matcher matcher = TOKEN_PATTERN.matcher(bodyCaptor.getValue());
        assertThat(matcher.find()).as("email body should contain a token= link").isTrue();
        return matcher.group(1);
    }
}
