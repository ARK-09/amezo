package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.common.exception.InvalidTokenException;
import com.arkindustries.amezo.identity.dto.SessionIdentityResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
class CurrentSessionService {

    private final SellerRepository sellerRepository;
    private final BuyerIdentityRepository buyerIdentityRepository;

    CurrentSessionService(SellerRepository sellerRepository, BuyerIdentityRepository buyerIdentityRepository) {
        this.sellerRepository = sellerRepository;
        this.buyerIdentityRepository = buyerIdentityRepository;
    }

    /**
     * Describes whoever the request's session cookie resolved to. Only reachable
     * behind SecurityConfig's authenticated() matcher, so "nobody is signed in"
     * is already answered with a 401 by
     * ProblemDetailAuthenticationEntryPoint before this runs.
     */
    @Transactional(readOnly = true)
    SessionIdentityResponse describeCurrent() {
        SessionCookieAuthenticationFilter.AuthenticatedIdentity identity = authenticatedIdentity();

        // Taken off the principal rather than resolved again: the authentication
        // filter has already asked which identities this address owns, and a second
        // answer computed here could differ from the one the request's own
        // authorization was decided with.
        UUID buyerIdentityId = identity.buyerIdentityId();
        UUID sellerId = identity.sellerId();

        return switch (identity.type()) {
            case SELLER -> sellerRepository.findById(identity.id())
                    .map(seller -> new SessionIdentityResponse(
                            IdentityType.SELLER,
                            seller.getId(),
                            seller.getEmail(),
                            seller.getFullName(),
                            identity.expiresAt(),
                            buyerIdentityId,
                            sellerId))
                    .orElseThrow(CurrentSessionService::identityGone);
            case BUYER -> buyerIdentityRepository.findById(identity.id())
                    .map(buyer -> new SessionIdentityResponse(
                            IdentityType.BUYER,
                            buyer.getId(),
                            buyer.getEmail(),
                            buyer.getFullName(),
                            identity.expiresAt(),
                            buyerIdentityId,
                            sellerId))
                    .orElseThrow(CurrentSessionService::identityGone);
        };
    }

    private SessionCookieAuthenticationFilter.AuthenticatedIdentity authenticatedIdentity() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !(authentication.getPrincipal() instanceof SessionCookieAuthenticationFilter.AuthenticatedIdentity identity)) {
            // Unreachable behind authenticated() - the filter only populates the
            // context when it resolves a valid, unexpired session row.
            throw new IllegalStateException("No authenticated identity in the security context");
        }
        return identity;
    }

    /**
     * A live session whose identity row is gone (seller deleted, database
     * restored from an older dump). 401, not 500: the cookie no longer names
     * anyone, which is the same thing the caller needs to hear as an expired
     * one - sign in again.
     */
    private static InvalidTokenException identityGone() {
        return new InvalidTokenException("Session is missing, expired, or invalid");
    }
}
