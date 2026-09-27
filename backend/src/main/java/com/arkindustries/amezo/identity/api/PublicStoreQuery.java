package com.arkindustries.amezo.identity.api;

import java.util.Optional;

/**
 * Identity's answer to "whose storefront is at this handle" - the third and last of
 * its cross-feature surfaces, beside {@link StoreRefQuery} and {@link CurrentSeller}.
 *
 * Read-only, and it never provisions. {@link StoreRefQuery} explains the same
 * distinction: a seller opening their own settings page may create their store row as
 * a side effect, but a shopper reading somebody else's storefront must not. A handle
 * with no store row behind it is {@link Optional#empty()}, which the caller answers
 * as a 404.
 *
 * Why the caller is in catalog rather than here: the store page is a catalogue view -
 * its product count, its category chips, its ratings and its listings are all
 * catalog's and reviews' data, and exposing that whole page shape back out of catalog
 * so identity could assemble it would be a far larger cross-feature surface than these
 * eleven fields.
 */
public interface PublicStoreQuery {

    Optional<PublicStoreProfile> findByHandle(String handle);
}
