package com.arkindustries.amezo.identity.api;

import java.util.Optional;
import java.util.UUID;

public interface BuyerIdentityLookup {

    /**
     * Existing identity is reused as-is (fullName never overwritten from a
     * later order) - a new one is created with fullName from the caller
     * only when no buyer_identity for that email exists yet.
     */
    UUID findOrCreateByEmail(String email, String fullName);

    /**
     * The buyer's display name, for whoever is showing their own review back to
     * them. Empty when there is no such identity; the name inside may still be
     * null, since a guest checkout only has to supply an email.
     */
    Optional<String> findFullName(UUID buyerIdentityId);

    /**
     * The identity behind an email, WITHOUT creating one. Checkout uses this to
     * tell whether the email on a guest order belongs to someone who already
     * exists; findOrCreateByEmail would make the question meaningless.
     */
    Optional<UUID> findIdByEmail(String email);
}
