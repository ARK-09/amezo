package com.arkindustries.amezo.identity.api;

import java.util.UUID;

/**
 * Reads the authenticated seller out of the current request's security
 * context. Only meaningful behind a hasRole("SELLER") route - SecurityConfig
 * guarantees a valid seller principal is present before any such controller
 * method runs, so there is no "not authenticated" case to handle here.
 */
public interface CurrentSeller {

    UUID sellerId();
}
