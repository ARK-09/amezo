package com.arkindustries.amezo.identity;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

/**
 * Seller sign-in. The magic-link mechanics live in MagicLinkAuthService, shared
 * with buyers; what is seller-specific is the seller row, the email copy and the
 * portal's verify path.
 *
 * <h2>Verifying as a seller also makes you a buyer</h2>
 *
 * A seller is a person, and people buy things. The session a seller link mints now
 * carries both roles when the address has both rows (see
 * {@link AccountIdentityResolver}) - but a seller who has never bought anything has
 * no buyer_identity row for that role to attach to, and their own My Orders would
 * answer 403 rather than "no orders yet". So the row is ensured here, from an
 * address this very call has just proved control of.
 *
 * It is deliberately NOT symmetrical: {@link BuyerAuthService} does not mint a
 * seller row. Buying needs no opt-in, while selling means a storefront with a public
 * handle on it, and that is a decision a person makes rather than one a sign-in
 * makes for them.
 */
@Service
public class SellerAuthService {

    private final SellerRepository sellerRepository;
    private final BuyerIdentityRepository buyerIdentityRepository;
    private final MagicLinkAuthService magicLinks;

    public SellerAuthService(
            SellerRepository sellerRepository,
            BuyerIdentityRepository buyerIdentityRepository,
            MagicLinkAuthService magicLinks) {
        this.sellerRepository = sellerRepository;
        this.buyerIdentityRepository = buyerIdentityRepository;
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
        ensureBuyerIdentity(seller);

        MagicLinkAuthService.IssuedSession session =
                magicLinks.issueSession(IdentityType.SELLER, seller.getId());

        return new VerifyResult(
                seller.getId(), seller.getEmail(), session.rawSessionToken(), session.expiresAt());
    }

    public void signOut(String rawSessionToken) {
        magicLinks.signOut(rawSessionToken);
    }

    /**
     * The buyer half of the same account, created only if it is missing.
     *
     * buyer_identity.full_name is NOT NULL, so the seller's own name stands in where
     * they have one and the address does otherwise - exactly what BuyerAuthService
     * does for a buyer signing in before their first order. Never overwritten for an
     * existing row: a guest checkout under this address supplied a real name, and a
     * seller sign-in is not new information about it.
     */
    private void ensureBuyerIdentity(Seller seller) {
        if (buyerIdentityRepository.findByEmail(seller.getEmail()).isPresent()) {
            return;
        }
        buyerIdentityRepository.save(BuyerIdentity.builder()
                .email(seller.getEmail())
                .fullName(seller.getFullName() == null ? seller.getEmail() : seller.getFullName())
                .build());
    }

    public record VerifyResult(UUID sellerId, String email, String rawSessionToken, Instant sessionExpiresAt) {
    }
}
