package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.dto.SessionIdentityResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Who am I?" for whichever identity the session cookie names. The frontend
 * calls this on boot: the buyer header shows the signed-in email, and the
 * seller portal uses the 401 to notice a cookie that expired while the tab was
 * closed (see frontend/src/features/checkout/api/useSession.ts). It answers for
 * buyers and sellers alike, which is why it lives at the generic /sessions
 * path from docs/api-design.md rather than under SellerAuthController's
 * seller-only /auth/seller prefix.
 *
 * Sign-out IS here, and deliberately so. It used to live only under the two
 * role-prefixed paths, and that was a bug rather than a tidy separation: the
 * buyer header's account page is reachable by a seller session too (a seller is
 * also a person with an address), but the only sign-out the page could call was
 * DELETE /auth/buyer/session, which SecurityConfig scopes to ROLE_BUYER. A
 * signed-in seller clicking "Sign out" got a 403, the mutation failed silently,
 * and the session survived the click and the reload after it.
 *
 * Revoking a session never needed to know which kind of identity it names -
 * MagicLinkAuthService.signOut hashes the token and deletes the row, and the
 * cookie it expires carries the same attributes whoever holds it. So the
 * role-agnostic route is the honest one, and the two role-prefixed sign-outs
 * stay only for the clients that already call them.
 */
@RestController
@RequestMapping("/sessions")
public class SessionController {

    private final CurrentSessionService currentSessionService;
    private final MagicLinkAuthService magicLinkAuthService;
    private final SessionCookies sessionCookies;

    SessionController(
            CurrentSessionService currentSessionService,
            MagicLinkAuthService magicLinkAuthService,
            SessionCookies sessionCookies) {
        this.currentSessionService = currentSessionService;
        this.magicLinkAuthService = magicLinkAuthService;
        this.sessionCookies = sessionCookies;
    }

    @GetMapping("/current")
    public SessionIdentityResponse current() {
        return currentSessionService.describeCurrent();
    }

    /**
     * Signs out whoever the cookie names, buyer or seller alike.
     *
     * Deleting the session row is what actually ends the session; expiring the
     * cookie only stops the browser resending a token that no longer resolves.
     * Both happen here, because doing just the second leaves a live row that any
     * copy of the cookie could still use.
     */
    @DeleteMapping("/current")
    public ResponseEntity<Void> signOut(HttpServletRequest request) {
        magicLinkAuthService.signOut(sessionCookies.read(request));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, sessionCookies.expired().toString())
                .build();
    }
}
