package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.dto.SellerMagicLinkRequest;
import com.arkindustries.amezo.identity.dto.SellerSessionResponse;
import com.arkindustries.amezo.identity.dto.SellerVerifyRequest;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

/**
 * Seller-scoped magic-link auth. Deliberately its own path prefix
 * (/auth/seller/*) rather than the generic /magic-links + /sessions shape
 * sketched in docs/api-design.md - this build is seller-only and
 * time-boxed, see docs/superpowers/plans. Buyer auth, if it reuses this
 * mechanism later, would get its own /auth/buyer/* controller against the
 * same identity/ services rather than reusing these paths.
 */
@RestController
@RequestMapping("/auth/seller")
public class SellerAuthController {

    private final SellerAuthService sellerAuthService;
    private final String cookieName;
    private final long sessionTtlDays;

    public SellerAuthController(
            SellerAuthService sellerAuthService,
            @Value("${app.session.cookie-name}") String cookieName,
            @Value("${app.session.ttl-days}") long sessionTtlDays) {
        this.sellerAuthService = sellerAuthService;
        this.cookieName = cookieName;
        this.sessionTtlDays = sessionTtlDays;
    }

    @PostMapping("/magic-link")
    public ResponseEntity<Void> requestMagicLink(@Valid @RequestBody SellerMagicLinkRequest request) {
        sellerAuthService.requestMagicLink(request.email());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/verify")
    public ResponseEntity<SellerSessionResponse> verify(@Valid @RequestBody SellerVerifyRequest request) {
        SellerAuthService.VerifyResult result = sellerAuthService.verify(request.token());

        ResponseCookie cookie = ResponseCookie.from(cookieName, result.rawSessionToken())
                .httpOnly(true)
                // Secure is left off for local http dev (see app.frontend-url) -
                // flip on once this deploys behind https.
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ofDays(sessionTtlDays))
                .build();

        return ResponseEntity.status(HttpStatus.OK)
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new SellerSessionResponse(result.sellerId(), result.email()));
    }

    @DeleteMapping("/session")
    public ResponseEntity<Void> signOut(HttpServletRequest request) {
        sellerAuthService.signOut(readCookie(request));

        ResponseCookie expired = ResponseCookie.from(cookieName, "")
                .httpOnly(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(0)
                .build();

        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, expired.toString())
                .build();
    }

    private String readCookie(HttpServletRequest request) {
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
}
