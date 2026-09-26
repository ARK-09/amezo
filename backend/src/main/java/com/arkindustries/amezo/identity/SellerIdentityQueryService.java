package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.api.SellerIdentityQuery;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

// Package-private: orders depends on the SellerIdentityQuery interface.
@Service
class SellerIdentityQueryService implements SellerIdentityQuery {

    private final SellerRepository sellerRepository;

    SellerIdentityQueryService(SellerRepository sellerRepository) {
        this.sellerRepository = sellerRepository;
    }

    /**
     * Unlike CurrentSellerResolver this never throws: it is called from a route that
     * is open to guests, where "nobody is signed in" is the normal case rather than
     * an impossible one.
     */
    @Override
    public Optional<UUID> currentSellerId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !(authentication.getPrincipal() instanceof SessionCookieAuthenticationFilter.AuthenticatedIdentity identity)
                || identity.type() != IdentityType.SELLER) {
            return Optional.empty();
        }
        return Optional.of(identity.id());
    }

    @Override
    public Optional<UUID> findIdByEmail(String email) {
        if (email == null || email.isBlank()) {
            return Optional.empty();
        }
        return sellerRepository.findByEmail(email).map(Seller::getId);
    }
}
