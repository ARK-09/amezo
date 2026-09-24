package com.arkindustries.amezo.identity;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
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
 */
@Component
public class SessionCookieAuthenticationFilter extends OncePerRequestFilter {

    private final SessionRepository sessionRepository;
    private final String cookieName;

    public SessionCookieAuthenticationFilter(
            SessionRepository sessionRepository,
            @Value("${app.session.cookie-name}") String cookieName) {
        this.sessionRepository = sessionRepository;
        this.cookieName = cookieName;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        readCookie(request).flatMap(this::resolveSession).ifPresent(session -> {
            GrantedAuthority authority = new SimpleGrantedAuthority("ROLE_" + session.getIdentityType());
            var authentication = new UsernamePasswordAuthenticationToken(
                    new AuthenticatedIdentity(session.getIdentityType(), session.getIdentityId()),
                    null,
                    List.of(authority));
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

    public record AuthenticatedIdentity(IdentityType type, UUID id) {
    }
}
