package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.identity.api.SellerStoreRefQuery;
import com.arkindustries.amezo.identity.api.StoreRef;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Identity's side of SellerStoreRefQuery.
 *
 * Package-private, like SellerIdentityQueryService: the only thing another
 * feature is allowed to know about is the interface.
 *
 * A class of its own rather than two more methods on SellerStoreService, which
 * owns GET/PATCH /api/v1/sellers/me/store. That service answers "my own store,
 * as I edit it"; this one answers "somebody else's store, as a stranger prints
 * it". Different subject, different shape, different callers - and keeping them
 * apart means a buyer-facing read cannot drift into the code that lets a seller
 * rename their shop.
 */
@Service
class SellerStoreRefQueryService implements SellerStoreRefQuery {

    private final SellerStoreRepository stores;
    private final SellerStoreService sellerStoreService;

    SellerStoreRefQueryService(SellerStoreRepository stores, SellerStoreService sellerStoreService) {
        this.stores = stores;
        this.sellerStoreService = sellerStoreService;
    }

    /**
     * Sellers whose store row already exists come back in the one query below.
     * The rest are provisioned through SellerStoreService.requireStore, which is
     * exactly what SellerStoreProvisioner's own doc comment says should happen -
     * "existing sellers get their store the first time ANYTHING reads it" - and
     * reuses the single place the default name and handle are derived instead of
     * growing a second, quietly different derivation here.
     *
     * Three consequences, stated rather than left to be discovered:
     *
     *  - this read can write. It is idempotent, race-safe (see the provisioner)
     *    and derived entirely from the seller's own record, so nothing about the
     *    caller reaches the row - but a GET that inserts is surprising enough to
     *    say out loud.
     *  - the alternative was a StoreRef with a null handle, and handle is
     *    required on StoreRef in the contract because the storefront URL is
     *    built from it. A null there is a broken link on somebody's screen.
     *  - a seller id that no longer has a seller row is simply ABSENT from the
     *    result, not a 404. Callers hold historical snapshots (order_line's
     *    seller_id_snapshot is deliberately not a foreign key), and one deleted
     *    seller must not take a buyer's whole order history down with it.
     *
     * The loop only runs for sellers nothing has ever read, so in steady state
     * this method is the single findBySellerIdIn and nothing else.
     */
    @Override
    public Map<UUID, StoreRef> storeRefsBySellerIds(Collection<UUID> sellerIds) {
        if (sellerIds == null || sellerIds.isEmpty()) {
            return Map.of();
        }

        Set<UUID> distinct = Set.copyOf(sellerIds);

        Map<UUID, StoreRef> result = new HashMap<>();
        for (SellerStore store : stores.findBySellerIdIn(distinct)) {
            result.put(store.getSellerId(), toRef(store));
        }

        for (UUID sellerId : distinct) {
            if (result.containsKey(sellerId)) {
                continue;
            }
            try {
                result.put(sellerId, toRef(sellerStoreService.requireStore(sellerId)));
            } catch (NotFoundException noSuchSeller) {
                // See the third consequence above: absent, not fatal.
            }
        }
        return Map.copyOf(result);
    }

    private static StoreRef toRef(SellerStore store) {
        return new StoreRef(store.getSellerId(), store.getName(), store.getHandle());
    }
}
