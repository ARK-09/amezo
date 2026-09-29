package com.arkindustries.amezo.identity.api;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

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

    /**
     * The OPEN storefronts belonging to these sellers, for a ranking computed in
     * another feature entirely - orders ranks sellers by sales, catalog by listings,
     * and neither of them may read seller_store.
     *
     * Returned in whatever order the database likes: the caller holds the ranking it
     * asked for and re-imposes it. Sellers with no store row, or whose store is on
     * vacation or closed, are simply absent - a shop that is not trading must not be
     * put on the front page, and that judgement belongs here rather than in the
     * feature doing the ranking.
     */
    List<PublicStoreProfile> findOpenBySellerIds(Collection<UUID> sellerIds);
}
