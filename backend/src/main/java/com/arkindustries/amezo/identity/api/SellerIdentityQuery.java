package com.arkindustries.amezo.identity.api;

import java.util.Optional;
import java.util.UUID;

/**
 * Who the caller is, as far as "is this person a seller?" goes. Checkout needs
 * this to refuse an order for the caller's own products, and it needs both halves,
 * because there are two ways a seller arrives at checkout:
 *
 *   - signed in, with a seller session cookie: currentSellerId;
 *   - as a guest, typing the email their seller account uses: findIdByEmail.
 *
 * The second is not a nicety. Checkout is open to guests by design, so a session
 * check alone would be bypassed by signing out - and the buyer email is not
 * optional on an order, so there is always something to check.
 */
public interface SellerIdentityQuery {

    /** Empty unless the current request carries a valid SELLER session. */
    Optional<UUID> currentSellerId();

    /** The seller registered under this email, if there is one. */
    Optional<UUID> findIdByEmail(String email);
}
