package com.arkindustries.amezo.identity;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

/**
 * Seller sign-in. The magic-link mechanics live in MagicLinkAuthService, shared
 * with buyers; what is seller-specific is the seller row, the email copy and the
 * portal's verify path.
 */
@Service
public class SellerAuthService {

    private final SellerRepository sellerRepository;
    private final MagicLinkAuthService magicLinks;

    public SellerAuthService(SellerRepository sellerRepository, MagicLinkAuthService magicLinks) {
        this.sellerRepository = sellerRepository;
        this.magicLinks = magicLinks;
    }

    public void requestMagicLink(String email) {
        magicLinks.requestMagicLink(
                IdentityType.SELLER, email, "/seller/verify", "Sign in to Amezo Seller Portal");
    }

    public VerifyResult verify(String rawToken) {
        String email = magicLinks.consumeToken(rawToken, IdentityType.SELLER);

        Seller seller = sellerRepository.findByEmail(email)
                .orElseGet(() -> sellerRepository.save(Seller.builder().email(email).build()));

        MagicLinkAuthService.IssuedSession session =
                magicLinks.issueSession(IdentityType.SELLER, seller.getId());

        return new VerifyResult(
                seller.getId(), seller.getEmail(), session.rawSessionToken(), session.expiresAt());
    }

    public void signOut(String rawSessionToken) {
        magicLinks.signOut(rawSessionToken);
    }

    public record VerifyResult(UUID sellerId, String email, String rawSessionToken, Instant sessionExpiresAt) {
    }
}
