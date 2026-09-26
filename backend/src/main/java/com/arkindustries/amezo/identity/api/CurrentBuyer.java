package com.arkindustries.amezo.identity.api;

import java.util.UUID;

/**
 * The buyer behind the current request's session cookie. The mirror of
 * CurrentSeller, and like it, only meaningful behind a hasRole("BUYER") route -
 * SecurityConfig guarantees a valid buyer principal before any such controller
 * method runs.
 */
public interface CurrentBuyer {

    UUID buyerIdentityId();
}
