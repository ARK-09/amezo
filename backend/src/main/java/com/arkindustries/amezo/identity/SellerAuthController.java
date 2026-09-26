package com.arkindustries.amezo.identity;

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

    @PostMapping("/magic-link")
    public ResponseEntity<Void> requestMagicLink(@Valid @RequestBody SellerMagicLinkRequest request) {
        sellerAuthService.requestMagicLink(request.email());
        return ResponseEntity.noContent().build();
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
