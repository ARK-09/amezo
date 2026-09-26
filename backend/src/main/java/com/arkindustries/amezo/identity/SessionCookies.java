package com.arkindustries.amezo.identity;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;

/**
 * The session cookie's attributes, in one place.
 *
 * Extracted when buyer sign-in arrived: a browser only replaces a cookie when
 * name, path and domain match, and SameSite=None without Secure is rejected
 * outright, so the cookie that signs someone out has to carry exactly the flags
 * the cookie that signed them in did. Three copies of that rule - seller sign-in,
 * seller sign-out, buyer sign-in - is three chances for one of them to drift and
 * for sign-out to silently stop working.
 *
 * The values come from app.session.* rather than being fixed here: local dev is
 * same-site over plain http (Lax, no Secure), while a deployed frontend on a
 * different domain than the API needs SameSite=None + Secure or the browser drops
 * the cookie on every API call. See application.yml.
 */
@Component
public class SessionCookies {

    private final String cookieName;
    private final long ttlDays;
    private final String sameSite;
    private final boolean secure;

    public SessionCookies(
            @Value("${app.session.cookie-name}") String cookieName,
            @Value("${app.session.ttl-days}") long ttlDays,
            @Value("${app.session.cookie-same-site}") String sameSite,
            @Value("${app.session.cookie-secure}") boolean secure) {
        this.cookieName = cookieName;
        this.ttlDays = ttlDays;
        this.sameSite = sameSite;
        this.secure = secure;
    }

    public ResponseCookie issued(String rawSessionToken) {
        return base(rawSessionToken).maxAge(Duration.ofDays(ttlDays)).build();
    }

    public ResponseCookie expired() {
        return base("").maxAge(0).build();
    }

    /** The raw cookie value on an inbound request, or null when there isn't one. */
    public String read(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        return List.of(cookies).stream()
                .filter(cookie -> cookieName.equals(cookie.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(cookieName, value)
                .httpOnly(true)
                .sameSite(sameSite)
                .secure(secure)
                .path("/");
    }
}
