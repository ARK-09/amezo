package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.api.CurrentSeller;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
class CurrentSellerResolver implements CurrentSeller {

    /**
     * The seller id off the principal, not the primary identity id.
     *
     * It used to return {@code identity.id()} whatever the session's type, which was
     * only safe because hasRole("SELLER") had already refused every buyer session -
     * a buyer reaching a seller route would have had their buyer id read as a seller
     * id. Now that one address can hold both, the distinction is load-bearing rather
     * than theoretical: a buyer-primary session belonging to someone who also sells
     * reaches these routes legitimately, and the id it must act as is the seller one.
     */
    @Override
    public UUID sellerId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !(authentication.getPrincipal() instanceof SessionCookieAuthenticationFilter.AuthenticatedIdentity identity)
                || identity.sellerId() == null) {
            // Unreachable behind SecurityConfig's hasRole("SELLER") matchers - the
            // filter only grants that role when it resolved a seller row for the
            // session's address, which is the id read back here.
            throw new IllegalStateException("No authenticated seller in the security context");
        }
        return identity.sellerId();
    }
}
