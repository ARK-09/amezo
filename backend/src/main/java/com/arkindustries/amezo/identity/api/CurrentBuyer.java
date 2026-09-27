package com.arkindustries.amezo.identity.api;

import java.util.Optional;
import java.util.UUID;

/**
 * The buyer behind the current request's session cookie. The mirror of
 * CurrentSeller, and like it, only meaningful behind a hasRole("BUYER") route -
 * SecurityConfig guarantees a valid buyer principal before any such controller
 * method runs.
 *
 * A session identifies a buyer whenever its verified address has a buyer_identity
 * row, whichever door the person signed in through. A seller who also buys is a
 * buyer here, because one address is one account.
 */
public interface CurrentBuyer {

    /**
     * The signed-in buyer, for a route that cannot be reached without being one.
     * Throws behind a route that admits guests - use
     * {@link #currentBuyerIdentityId()} there.
     */
    UUID buyerIdentityId();

    /**
     * The signed-in buyer, or empty when nobody is. For the routes open to guests,
     * where being signed in changes what happens rather than whether it may.
     *
     * Checkout is the caller: an order placed by someone signed in belongs to THEIR
     * account, even when they type a different address into the contact field, and
     * "nobody is signed in" is the ordinary guest case rather than a failure.
     */
    Optional<UUID> currentBuyerIdentityId();
}
