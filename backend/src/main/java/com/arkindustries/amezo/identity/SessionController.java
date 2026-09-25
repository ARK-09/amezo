package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.dto.SessionIdentityResponse;
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
 * Sign-out is NOT here: DELETE /auth/seller/session already revokes the row
 * and expires the cookie, and one logout endpoint is enough.
 */
@RestController
@RequestMapping("/sessions")
public class SessionController {

    private final CurrentSessionService currentSessionService;

    SessionController(CurrentSessionService currentSessionService) {
        this.currentSessionService = currentSessionService;
    }

    @GetMapping("/current")
    public SessionIdentityResponse current() {
        return currentSessionService.describeCurrent();
    }
}
