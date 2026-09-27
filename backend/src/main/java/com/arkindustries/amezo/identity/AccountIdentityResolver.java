package com.arkindustries.amezo.identity;

import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Resolves a session's one stored identity into every identity its address owns.
 * See {@link AccountIdentities} for why the address is the join.
 *
 * <h2>Resolved per request rather than stored on the session</h2>
 *
 * The alternative was two columns on `session`, written at sign-in. This costs two
 * indexed lookups on the authentication path instead - one to read the primary
 * row's email, one to find the counterpart under it - and buys the property that
 * matters more: it is always current. A buyer who becomes a seller gains the seller
 * role on the session they already hold, rather than having to notice that signing
 * out and in again is what makes their new storefront reachable. A stored pair
 * would have been a snapshot of what the account looked like at sign-in, and the
 * bug it produces - a portal that 403s until you sign in again - is exactly the
 * kind nobody reports because they work around it.
 */
@Component
class AccountIdentityResolver {

    private final BuyerIdentityRepository buyers;
    private final SellerRepository sellers;

    AccountIdentityResolver(BuyerIdentityRepository buyers, SellerRepository sellers) {
        this.buyers = buyers;
        this.sellers = sellers;
    }

    /**
     * Both identities behind a live session.
     *
     * The primary id is trusted and reused as-is rather than re-read, so the role
     * the session was minted with survives even if the counterpart lookup finds
     * nothing. An empty result means the session's own identity row is gone - a
     * seller deleted, a database restored from an older dump - which
     * {@link CurrentSessionService} already reports as a session that no longer
     * names anyone.
     */
    AccountIdentities forSession(IdentityType primaryType, UUID primaryId) {
        return switch (primaryType) {
            case BUYER -> buyers.findById(primaryId)
                    .map(buyer -> new AccountIdentities(
                            buyer.getId(), sellerIdFor(buyer.getEmail())))
                    .orElse(AccountIdentities.NONE);
            case SELLER -> sellers.findById(primaryId)
                    .map(seller -> new AccountIdentities(
                            buyerIdentityIdFor(seller.getEmail()), seller.getId()))
                    .orElse(AccountIdentities.NONE);
        };
    }

    private UUID sellerIdFor(String email) {
        return sellers.findByEmail(email).map(Seller::getId).orElse(null);
    }

    private UUID buyerIdentityIdFor(String email) {
        return buyers.findByEmail(email).map(BuyerIdentity::getId).orElse(null);
    }
}
