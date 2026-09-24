package com.arkindustries.amezo.identity.api;

import java.util.UUID;

public interface BuyerIdentityLookup {

    /**
     * Existing identity is reused as-is (fullName never overwritten from a
     * later order) - a new one is created with fullName from the caller
     * only when no buyer_identity for that email exists yet.
     */
    UUID findOrCreateByEmail(String email, String fullName);
}
