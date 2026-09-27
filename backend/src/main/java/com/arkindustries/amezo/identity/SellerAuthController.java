package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.dto.MagicLinkResponse;
import com.arkindustries.amezo.identity.dto.SellerMagicLinkRequest;
import com.arkindustries.amezo.identity.dto.SellerSessionResponse;
import com.arkindustries.amezo.identity.dto.SellerVerifyRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Seller-scoped magic-link auth, on its own path prefix (/auth/seller/*) rather
 * than the generic /magic-links + /sessions shape sketched in
 * docs/api-design.md. Buyers now have the mirror of this at /auth/buyer/* -
 * separate controllers over the same MagicLinkAuthService, because what differs
 * between them is which identity table the row lands in and where the emailed
 * link points, not the mechanics.
 */
@RestController
@RequestMapping("/auth/seller")
public class SellerAuthController {

    private final SellerAuthService sellerAuthService;
    private final SessionCookies sessionCookies;

    public SellerAuthController(SellerAuthService sellerAuthService, SessionCookies sessionCookies) {
        this.sellerAuthService = sellerAuthService;
        this.sessionCookies = sessionCookies;
    }

    /**
     * 200 with a body rather than the 204 this used to answer, because the demo
     * address gets its token back here instead of by email (see identity/DemoAccount).
     * For every other address the body's token is null and the behaviour is unchanged
     * - including that it succeeds whether or not the address has an account, so the
     * response still says nothing about who exists.
     */
    @PostMapping("/magic-link")
    public MagicLinkResponse requestMagicLink(@Valid @RequestBody SellerMagicLinkRequest request) {
        return new MagicLinkResponse(sellerAuthService.requestMagicLink(request.email()));
    }

    @PostMapping("/verify")
    public ResponseEntity<SellerSessionResponse> verify(@Valid @RequestBody SellerVerifyRequest request) {
        SellerAuthService.VerifyResult result = sellerAuthService.verify(request.token());

        return ResponseEntity.status(HttpStatus.OK)
                .header(HttpHeaders.SET_COOKIE, sessionCookies.issued(result.rawSessionToken()).toString())
                .body(new SellerSessionResponse(result.sellerId(), result.email()));
    }

    @DeleteMapping("/session")
    public ResponseEntity<Void> signOut(HttpServletRequest request) {
        sellerAuthService.signOut(sessionCookies.read(request));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, sessionCookies.expired().toString())
                .build();
    }
}
