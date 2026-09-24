package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.api.CurrentSeller;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
class CurrentSellerResolver implements CurrentSeller {

    @Override
    public UUID sellerId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !(authentication.getPrincipal() instanceof SessionCookieAuthenticationFilter.AuthenticatedIdentity identity)) {
            // Unreachable behind SecurityConfig's hasRole("SELLER") matchers -
            // the filter only authenticates a request when it resolves a
            // valid, unexpired session.
            throw new IllegalStateException("No authenticated seller in the security context");
        }
        return identity.id();
    }
}
