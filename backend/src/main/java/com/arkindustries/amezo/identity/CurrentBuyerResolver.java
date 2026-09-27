package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.api.CurrentBuyer;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
class CurrentBuyerResolver implements CurrentBuyer {

    @Override
    public UUID buyerIdentityId() {
        return currentBuyerIdentityId().orElseThrow(
                // Unreachable behind SecurityConfig's hasRole("BUYER") matchers - the
                // filter only grants that role when it resolved a buyer_identity row
                // for the session's address, which is the id read back here.
                () -> new IllegalStateException("No authenticated buyer in the security context"));
    }

    /**
     * Reads the buyer id off the principal rather than testing {@code type() ==
     * BUYER}, and that is the whole of what lets one address buy and sell. A seller
     * who signed in through the portal carries a SELLER primary type and, if their
     * address also has a buyer_identity row, the buyer id beside it - so their own
     * order history resolves instead of throwing at an identity type that was never
     * the question.
     */
    @Override
    public Optional<UUID> currentBuyerIdentityId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !(authentication.getPrincipal() instanceof SessionCookieAuthenticationFilter.AuthenticatedIdentity identity)) {
            return Optional.empty();
        }
        return Optional.ofNullable(identity.buyerIdentityId());
    }
}
