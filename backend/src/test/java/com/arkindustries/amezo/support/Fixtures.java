package com.arkindustries.amezo.support;

import com.arkindustries.amezo.catalog.Category;
import com.arkindustries.amezo.catalog.CategoryRepository;
import com.arkindustries.amezo.catalog.Slugs;
import com.arkindustries.amezo.identity.IdentityType;
import com.arkindustries.amezo.identity.Session;
import com.arkindustries.amezo.identity.SessionRepository;
import jakarta.servlet.http.Cookie;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Shared fixture helpers for the integration tests.
 *
 * Products gained two required columns - a category FK and a unique slug - and
 * every test that builds one now has to satisfy both. Doing that inline in each
 * test meant repeating a category lookup and inventing a unique slug dozens of
 * times, which is noise in a test whose subject is images or stock.
 */
public final class Fixtures {

    private Fixtures() {
    }

    /**
     * The id of a seeded system category, creating it if this test wants one the
     * seed doesn't have (a test about filtering doesn't care whether "furniture" is
     * part of the real merchandising list).
     */
    public static UUID categoryId(CategoryRepository categories, String slug) {
        return categories.findBySlug(slug)
                .orElseGet(() -> categories.save(Category.builder()
                        .slug(slug)
                        .name(slug)
                        .active(true)
                        .position(9_000)
                        .build()))
                .getId();
    }

    /**
     * A slug that cannot collide with another fixture's. Tests reuse titles freely
     * ("Not yours" appears in a dozen of them) and product.slug is UNIQUE, so
     * deriving it from the title alone would make the second insert fail on
     * something unrelated to what the test is checking. Tests that care about slug
     * generation set it explicitly instead.
     */
    public static String uniqueSlug(String title) {
        return Slugs.slugify(title) + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    /** The cookie name the test profile configures; matches application.yml's default. */
    public static final String SESSION_COOKIE = "mp_session";

    /**
     * An authenticated session, minted straight into the table.
     *
     * Most tests need "a signed-in seller" or "a signed-in buyer" as a precondition,
     * not a magic-link round trip: going through the real flow means mocking
     * EmailSender, which is package-private to identity and therefore unreachable
     * from a test in catalog or orders. The token format is the only thing shared
     * with the production path - SHA-256 hex of the raw value, which is what
     * SessionCookieAuthenticationFilter looks up - so a session made here is
     * indistinguishable from a signed-in one.
     *
     * The magic-link flow itself is covered by the auth tests that live in identity.
     */
    public static Cookie sessionCookie(SessionRepository sessions, IdentityType type, UUID identityId) {
        byte[] random = new byte[32];
        new java.security.SecureRandom().nextBytes(random);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(random);

        sessions.save(Session.builder()
                .identityType(type)
                .identityId(identityId)
                .tokenHash(sha256Hex(rawToken))
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());

        return new Cookie(SESSION_COOKIE, rawToken);
    }

    private static String sha256Hex(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes()));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
