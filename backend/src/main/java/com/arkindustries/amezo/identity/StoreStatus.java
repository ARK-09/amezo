package com.arkindustries.amezo.identity;

/**
 * Whether a storefront is trading. Mirrors StoreStatus in
 * frontend/openapi/fixture.yaml and the CHECK constraint in V18.
 *
 * VACATION is distinct from CLOSED on purpose: a store on holiday is coming
 * back and says so (vacationNote), a closed one is not.
 */
public enum StoreStatus {
    OPEN,
    VACATION,
    CLOSED
}
