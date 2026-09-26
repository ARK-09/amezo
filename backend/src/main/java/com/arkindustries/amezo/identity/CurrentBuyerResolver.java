package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.api.CurrentBuyer;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
class CurrentBuyerResolver implements CurrentBuyer {

    @Override
    public UUID buyerIdentityId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !(authentication.getPrincipal() instanceof SessionCookieAuthenticationFilter.AuthenticatedIdentity identity)
                || identity.type() != IdentityType.BUYER) {
            // Unreachable behind SecurityConfig's hasRole("BUYER") matchers - the
            // filter only authenticates a request when it resolves a valid,
            // unexpired session, and the role comes from that session's type.
            throw new IllegalStateException("No authenticated buyer in the security context");
        }
        return identity.id();
    }
}
