package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.dto.BuyerMagicLinkRequest;
import com.arkindustries.amezo.identity.dto.BuyerSessionResponse;
import com.arkindustries.amezo.identity.dto.BuyerVerifyRequest;
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
 * Buyer sign-in, the mirror of SellerAuthController. Exists because a review has
 * to be attributable: the purchase check needs a buyer identity in the session,
 * and until now a buyer could only be known through an order.
 *
 * Same cookie, same filter, same session table - the role comes from the session's
 * identity_type, which is what makes POST /reviews buyer-only and the seller
 * portal seller-only without two auth systems.
 */
@RestController
@RequestMapping("/auth/buyer")
public class BuyerAuthController {

    private final BuyerAuthService buyerAuthService;
    private final SessionCookies sessionCookies;

    public BuyerAuthController(BuyerAuthService buyerAuthService, SessionCookies sessionCookies) {
        this.buyerAuthService = buyerAuthService;
        this.sessionCookies = sessionCookies;
    }

    @PostMapping("/magic-link")
    public ResponseEntity<Void> requestMagicLink(@Valid @RequestBody BuyerMagicLinkRequest request) {
        buyerAuthService.requestMagicLink(request.email());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/verify")
    public ResponseEntity<BuyerSessionResponse> verify(@Valid @RequestBody BuyerVerifyRequest request) {
        BuyerAuthService.VerifyResult result = buyerAuthService.verify(request.token());

        return ResponseEntity.status(HttpStatus.OK)
                .header(HttpHeaders.SET_COOKIE, sessionCookies.issued(result.rawSessionToken()).toString())
                .body(new BuyerSessionResponse(result.buyerIdentityId(), result.email(), result.fullName()));
    }

    @DeleteMapping("/session")
    public ResponseEntity<Void> signOut(HttpServletRequest request) {
        buyerAuthService.signOut(sessionCookies.read(request));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, sessionCookies.expired().toString())
                .build();
    }
}
