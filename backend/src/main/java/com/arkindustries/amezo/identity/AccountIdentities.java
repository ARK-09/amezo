package com.arkindustries.amezo.identity;

import java.util.UUID;

/**
 * Every identity row one verified email address owns.
 *
 * <h2>The address is the account</h2>
 *
 * Amezo stores buyers and sellers in two tables, each with its own unique email,
 * so the same address can legitimately appear in both - and a person who buys and
 * sells always will. What did NOT exist was anything joining them: a session named
 * one row, granted one role, and there is only one session cookie, so signing into
 * the seller portal replaced the buyer's session outright. The same person could be
 * a buyer or a seller, never both, and My Orders answered 403 to a seller who had
 * bought something an hour earlier.
 *
 * This is the join, and it is by address rather than by a link column on purpose:
 * both rows can only come to exist for an address somebody proved control of - a
 * seller row solely through a seller magic link, a buyer row through a buyer magic
 * link or through a checkout that named the address. So whoever holds a live link
 * for the address is entitled to whichever of the two rows exist under it, and
 * there is no third party for the equality to admit.
 *
 * <h2>Either field may be null</h2>
 *
 * Only the primary identity - the one the session's own magic link minted - is
 * guaranteed. A buyer who has never sold has no seller row and must not be handed
 * ROLE_SELLER; becoming a seller is a deliberate act that mints a storefront, not
 * something a sign-in should do on someone's behalf. The reverse is filled in for
 * them: {@link SellerAuthService} ensures the buyer row, because buying needs no
 * opt-in and a seller with no buyer row would be refused their own order history.
 */
record AccountIdentities(UUID buyerIdentityId, UUID sellerId) {

    static final AccountIdentities NONE = new AccountIdentities(null, null);

    boolean isBuyer() {
        return buyerIdentityId != null;
    }

    boolean isSeller() {
        return sellerId != null;
    }
}
