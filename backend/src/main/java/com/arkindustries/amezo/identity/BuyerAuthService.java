package com.arkindustries.amezo.identity;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

/**
 * Buyer sign-in, the mirror of SellerAuthService over the same magic-link
 * mechanics. Built because writing a review requires knowing who is writing it,
 * and until now the only way to become a known buyer was to place an order - which
 * created an identity row but never a session.
 *
 * A buyer_identity row may well already exist for the address from a guest
 * checkout; signing in adopts it rather than creating a second one, so the
 * purchases that make someone eligible to review are the same purchases they made
 * as a guest.
 */
@Service
public class BuyerAuthService {

    private final BuyerIdentityRepository buyerIdentityRepository;
    private final MagicLinkAuthService magicLinks;

    public BuyerAuthService(BuyerIdentityRepository buyerIdentityRepository, MagicLinkAuthService magicLinks) {
        this.buyerIdentityRepository = buyerIdentityRepository;
        this.magicLinks = magicLinks;
    }

    public void requestMagicLink(String email) {
        magicLinks.requestMagicLink(IdentityType.BUYER, email, "/verify", "Sign in to Amezo");
    }

    public VerifyResult verify(String rawToken) {
        String email = magicLinks.consumeToken(rawToken, IdentityType.BUYER);

        // full_name is NOT NULL on buyer_identity, and a magic link only proves an
        // address. The email stands in until an order supplies a real name -
        // findOrCreateByEmail never overwrites an existing one, so a later guest
        // checkout with a proper name still wins for a row created here.
        BuyerIdentity buyer = buyerIdentityRepository.findByEmail(email)
                .orElseGet(() -> buyerIdentityRepository.save(
                        BuyerIdentity.builder().email(email).fullName(email).build()));

        MagicLinkAuthService.IssuedSession session =
                magicLinks.issueSession(IdentityType.BUYER, buyer.getId());

        return new VerifyResult(
                buyer.getId(), buyer.getEmail(), buyer.getFullName(),
                session.rawSessionToken(), session.expiresAt());
    }

    public void signOut(String rawSessionToken) {
        magicLinks.signOut(rawSessionToken);
    }

    public record VerifyResult(
            UUID buyerIdentityId,
            String email,
            String fullName,
            String rawSessionToken,
            Instant sessionExpiresAt) {
    }
}
