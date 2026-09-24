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

@Service
public class SellerAuthService {

    private final SellerRepository sellerRepository;
    private final MagicLinkTokenRepository magicLinkTokenRepository;
    private final SessionRepository sessionRepository;
    private final EmailSender emailSender;
    private final String frontendUrl;
    private final long magicLinkTtlMinutes;
    private final long sessionTtlDays;

    private static final SecureRandom RANDOM = new SecureRandom();

    public SellerAuthService(
            SellerRepository sellerRepository,
            MagicLinkTokenRepository magicLinkTokenRepository,
            SessionRepository sessionRepository,
            EmailSender emailSender,
            @Value("${app.frontend-url}") String frontendUrl,
            @Value("${app.magic-link.ttl-minutes}") long magicLinkTtlMinutes,
            @Value("${app.session.ttl-days}") long sessionTtlDays) {
        this.sellerRepository = sellerRepository;
        this.magicLinkTokenRepository = magicLinkTokenRepository;
        this.sessionRepository = sessionRepository;
        this.emailSender = emailSender;
        this.frontendUrl = frontendUrl;
        this.magicLinkTtlMinutes = magicLinkTtlMinutes;
        this.sessionTtlDays = sessionTtlDays;
    }

    /**
     * Always succeeds regardless of whether the email has a seller account -
     * never reveals account existence. No Seller row is created here; that
     * happens lazily at verify() time (see MagicLinkToken's own note on why
     * it stores email, not identityId).
     */
    public void requestMagicLink(String email) {
        String rawToken = randomToken();
        MagicLinkToken token = MagicLinkToken.builder()
                .identityType(IdentityType.SELLER)
                .email(email)
                .tokenHash(sha256Hex(rawToken))
                .expiresAt(Instant.now().plus(Duration.ofMinutes(magicLinkTtlMinutes)))
                .build();
        magicLinkTokenRepository.save(token);

        String link = frontendUrl + "/seller/verify?token=" + rawToken;
        emailSender.send(email, "Sign in to Amezo Seller Portal",
                "Click to sign in (expires in " + magicLinkTtlMinutes + " minutes): " + link);
    }

    public VerifyResult verify(String rawToken) {
        MagicLinkToken token = magicLinkTokenRepository.findByTokenHash(sha256Hex(rawToken))
                .orElseThrow(() -> new InvalidTokenException("Token is invalid"));

        if (token.getConsumedAt() != null) {
            throw new InvalidTokenException("Token has already been used");
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            throw new InvalidTokenException("Token has expired");
        }

        token.setConsumedAt(Instant.now());
        magicLinkTokenRepository.save(token);

        Seller seller = sellerRepository.findByEmail(token.getEmail())
                .orElseGet(() -> sellerRepository.save(Seller.builder().email(token.getEmail()).build()));

        String rawSessionToken = randomToken();
        Instant sessionExpiresAt = Instant.now().plus(Duration.ofDays(sessionTtlDays));
        sessionRepository.save(Session.builder()
                .identityType(IdentityType.SELLER)
                .identityId(seller.getId())
                .tokenHash(sha256Hex(rawSessionToken))
                .expiresAt(sessionExpiresAt)
                .build());

        return new VerifyResult(seller.getId(), seller.getEmail(), rawSessionToken, sessionExpiresAt);
    }

    /** No-op if the cookie is missing or doesn't match a live session - sign-out is always a success from the client's view. */
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

    // Same algorithm as SessionCookieAuthenticationFilter's private hash() -
    // kept as a small duplicate rather than a shared extraction, since the
    // filter is foundational/security-critical code this pass avoids touching.
    private String sha256Hex(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes());
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public record VerifyResult(java.util.UUID sellerId, String email, String rawSessionToken, Instant sessionExpiresAt) {
    }
}
