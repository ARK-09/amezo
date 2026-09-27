package com.arkindustries.amezo.identity;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * The one address whose sign-in link is handed back in the response instead of
 * emailed.
 *
 * <h2>Why it exists</h2>
 *
 * Every sign-in here is a magic link, so an instance that cannot deliver email
 * cannot let anybody in. Resend's free tier is a sandbox until a domain is verified
 * - it delivers only to the account holder's own address - and it is rate limited
 * besides, so a demo that depends on it stops working on somebody else's schedule.
 * With a demo address configured, walking the app needs no inbox and no provider.
 *
 * <h2>What it is, and what it deliberately is not</h2>
 *
 * It is a PUBLIC SHARED ACCOUNT. Anyone who knows the address can sign in as it, and
 * that is the intended behaviour - the same as a "try the demo" button. So the
 * account must hold demo data and nothing else, which is a fact about how it is
 * used rather than something code can enforce; it is stated here because whoever
 * sets DEMO_EMAIL is the person who needs to know it.
 *
 * It is NOT a way in to any other account, and the narrowness is the whole safety
 * argument:
 *
 * <ul>
 *   <li>unset by default, so there is no demo address at all unless one is
 *       configured - and no default value to guess;
 *   <li>EXACT match on the whole address. Never a domain, never a prefix, never a
 *       pattern - a rule that matched a shape rather than a string is one that
 *       eventually admits an address nobody chose;
 *   <li>nothing else about authentication changes. The token it returns is an
 *       ordinary magic-link token: same table, same expiry, still single-use, still
 *       redeemed through the same /verify endpoint that mints the session. The only
 *       difference is how it reaches the browser.
 * </ul>
 */
@Component
class DemoAccount {

    private static final Logger log = LoggerFactory.getLogger(DemoAccount.class);

    /** Normalised, or null when no demo address is configured. */
    private final String email;

    DemoAccount(@Value("${app.demo.email:}") String email) {
        this.email = email == null || email.isBlank() ? null : normalise(email);
    }

    @PostConstruct
    void announce() {
        if (email == null) {
            return;
        }
        // Loud, and naming the address: an operator who set this by accident should
        // see it in the first screen of the boot log rather than discover it later.
        log.warn("Demo sign-in ENABLED for {} - a magic link requested for that address is "
                + "RETURNED IN THE RESPONSE instead of emailed, so anyone who knows it can sign "
                + "in as it. Use it only for an account holding demo data.", email);
    }

    /**
     * Whether this is the demo address.
     *
     * Trimmed and lower-cased on both sides, because a person typing their own
     * address into a form types it differently than an operator typing it into an
     * environment variable - and a demo that failed on a capital letter would be
     * reported as the demo being broken.
     */
    boolean matches(String candidate) {
        return email != null && candidate != null && email.equals(normalise(candidate));
    }

    private static String normalise(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
