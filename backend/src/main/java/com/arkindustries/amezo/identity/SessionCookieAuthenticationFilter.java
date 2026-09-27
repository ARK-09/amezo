package com.arkindustries.amezo.identity;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Resolves the session cookie into an authenticated principal. Absence,
 * garbage, or expiry of the cookie just leaves the security context
 * empty - Spring Security's own access rules then produce a 401/403,
 * formatted by ProblemDetailAuthenticationEntryPoint /
 * ProblemDetailAccessDeniedHandler in the config package (this class never
 * writes a response itself).
 *
 * <h2>One session, every role its address holds</h2>
 *
 * A session row names one identity - the one whose magic link minted it - and that
 * used to be the only role it granted. It was also the only session there can be,
 * because there is one cookie: signing into the seller portal replaced a buyer's
 * session outright, so the same person could sell or buy and never both, and My
 * Orders answered 403 to a seller who had bought something an hour before.
 *
 * So the stored identity is resolved through {@link AccountIdentityResolver} into
 * every identity the session's verified address owns, and each one contributes its
 * role. A person who is both gets ROLE_BUYER and ROLE_SELLER from the one cookie,
 * and every existing route rule keeps working unchanged - hasRole("BUYER") now
 * admits them because they really are one.
 */
@Component
public class SessionCookieAuthenticationFilter extends OncePerRequestFilter {

    private final SessionRepository sessionRepository;
    private final AccountIdentityResolver accountIdentityResolver;
    private final String cookieName;

    public SessionCookieAuthenticationFilter(
            SessionRepository sessionRepository,
            AccountIdentityResolver accountIdentityResolver,
            @Value("${app.session.cookie-name}") String cookieName) {
        this.sessionRepository = sessionRepository;
        this.accountIdentityResolver = accountIdentityResolver;
        this.cookieName = cookieName;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        readCookie(request).flatMap(this::resolveSession).ifPresent(session -> {
            AccountIdentities identities = accountIdentityResolver.forSession(
                    session.getIdentityType(), session.getIdentityId());

            // A role per identity that actually exists. Both for someone who buys and
            // sells under one address; one for everybody else. Never an empty list:
            // the primary row is what minted the session, so at least its own role is
            // always here unless the row itself has been deleted - and then there is
            // nobody to authenticate, which is the same answer as no cookie.
            List<SimpleGrantedAuthority> authorities = new ArrayList<>(2);
            if (identities.isBuyer()) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + IdentityType.BUYER));
            }
            if (identities.isSeller()) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + IdentityType.SELLER));
            }
            if (authorities.isEmpty()) {
                return;
            }

            var authentication = new UsernamePasswordAuthenticationToken(
                    new AuthenticatedIdentity(
                            session.getIdentityType(),
                            session.getIdentityId(),
                            session.getExpiresAt(),
                            identities.buyerIdentityId(),
                            identities.sellerId()),
                    null,
                    authorities);
            SecurityContextHolder.getContext().setAuthentication(authentication);
        });

        chain.doFilter(request, response);
    }

    private Optional<String> readCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        return List.of(cookies).stream()
                .filter(cookie -> cookieName.equals(cookie.getName()))
                .map(Cookie::getValue)
                .findFirst();
    }

    private Optional<Session> resolveSession(String rawToken) {
        return sessionRepository.findByTokenHash(hash(rawToken))
                .filter(session -> !session.isExpired());
    }

    private String hash(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes());
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Carries expiresAt as well as the identity because GET /sessions/current
     * reports it, and this filter already holds the Session row it came from -
     * re-reading the session by cookie in the controller would hash and query
     * for a row the request has resolved once already.
     *
     * {@code type} and {@code id} are the PRIMARY identity: the row this session's
     * own magic link named, which is what /sessions/current reports as the door the
     * person came in by. The two ids beside them are every identity the address owns
     * (see {@link AccountIdentities}), and they are what the CurrentBuyer /
     * CurrentSeller resolvers read - {@code id} alone cannot answer "which seller is
     * this?" for a session whose primary identity is the buyer half of the same
     * account. Either may be null; at least one is not.
     */
    public record AuthenticatedIdentity(
            IdentityType type,
            UUID id,
            Instant expiresAt,
            UUID buyerIdentityId,
            UUID sellerId) {
    }
}
