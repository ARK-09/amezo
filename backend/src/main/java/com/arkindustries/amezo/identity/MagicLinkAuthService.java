package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.common.exception.InvalidTokenException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

/**
 * The magic-link mechanics, shared by both identity types: issue a token, email
 * it, consume it exactly once, and mint a session cookie value.
 *
 * Extracted when buyers needed sign-in too. The alternative was a BuyerAuthService
 * that was SellerAuthService with two words changed - and two copies of
 * token-hashing and single-use enforcement is exactly the kind of duplication that
 * ends with one copy getting a fix and the other not.
 *
 * What stays with the callers is the part that genuinely differs: which table the
 * identity row lives in, what the email says, and where the link points.
 */
@Service
public class MagicLinkAuthService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final MagicLinkTokenRepository magicLinkTokenRepository;
    private final SessionRepository sessionRepository;
    private final EmailSender emailSender;
    private final String frontendUrl;
    private final long magicLinkTtlMinutes;
    private final long sessionTtlDays;

    public MagicLinkAuthService(
            MagicLinkTokenRepository magicLinkTokenRepository,
            SessionRepository sessionRepository,
            EmailSender emailSender,
            @Value("${app.frontend-url}") String frontendUrl,
            @Value("${app.magic-link.ttl-minutes}") long magicLinkTtlMinutes,
            @Value("${app.session.ttl-days}") long sessionTtlDays) {
        this.magicLinkTokenRepository = magicLinkTokenRepository;
        this.sessionRepository = sessionRepository;
        this.emailSender = emailSender;
        this.frontendUrl = frontendUrl;
        this.magicLinkTtlMinutes = magicLinkTtlMinutes;
        this.sessionTtlDays = sessionTtlDays;
    }

    /**
     * Always succeeds regardless of whether the email has an account - never
     * reveals account existence. No identity row is created here; that happens
     * lazily at consume time (see MagicLinkToken on why it stores an email rather
     * than an identity id).
     */
    public void requestMagicLink(IdentityType identityType, String email, String verifyPath, String subject) {
        String rawToken = randomToken();
        magicLinkTokenRepository.save(MagicLinkToken.builder()
                .identityType(identityType)
                .email(email)
                .tokenHash(sha256Hex(rawToken))
                .expiresAt(Instant.now().plus(Duration.ofMinutes(magicLinkTtlMinutes)))
                .build());

        String link = frontendUrl + verifyPath + "?token=" + rawToken;
        emailSender.send(email, subject,
                "Click to sign in (expires in " + magicLinkTtlMinutes + " minutes): " + link);
    }

    /**
     * Validates a token, marks it used, and returns the email it was issued to.
     *
     * expectedType is not decoration. A seller's token presented to the buyer verify
     * endpoint would otherwise mint a BUYER session for that email - handing the
     * buyer role to whoever holds a seller link. Type is part of what the token
     * authorises, so it is checked here rather than trusted from the route.
     */
    public String consumeToken(String rawToken, IdentityType expectedType) {
        MagicLinkToken token = magicLinkTokenRepository.findByTokenHash(sha256Hex(rawToken))
                .orElseThrow(() -> new InvalidTokenException("Token is invalid"));

        if (token.getIdentityType() != expectedType) {
            // Deliberately the same message as an unknown token: which kind of link
            // an address holds is not something this endpoint should confirm.
            throw new InvalidTokenException("Token is invalid");
        }
        if (token.getConsumedAt() != null) {
            throw new InvalidTokenException("Token has already been used");
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            throw new InvalidTokenException("Token has expired");
        }

        token.setConsumedAt(Instant.now());
        magicLinkTokenRepository.save(token);
        return token.getEmail();
    }

    /** A fresh session row, returning the raw cookie value (only the hash is stored). */
    public IssuedSession issueSession(IdentityType identityType, UUID identityId) {
        String rawSessionToken = randomToken();
        Instant expiresAt = Instant.now().plus(Duration.ofDays(sessionTtlDays));
        sessionRepository.save(Session.builder()
                .identityType(identityType)
                .identityId(identityId)
                .tokenHash(sha256Hex(rawSessionToken))
                .expiresAt(expiresAt)
                .build());
        return new IssuedSession(rawSessionToken, expiresAt);
    }

    /**
     * No-op if the cookie is missing or doesn't match a live session - sign-out is
     * always a success from the client's view.
     */
    public void signOut(String rawSessionToken) {
        if (rawSessionToken == null) {
            return;
        }
        sessionRepository.findByTokenHash(sha256Hex(rawSessionToken)).ifPresent(sessionRepository::delete);
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    // Same algorithm as SessionCookieAuthenticationFilter's private hash() - kept as
    // a small duplicate rather than a shared extraction, since the filter is
    // foundational/security-critical code this pass avoids touching.
    private String sha256Hex(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes());
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public record IssuedSession(String rawSessionToken, Instant expiresAt) {
    }
}
