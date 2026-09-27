package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.api.StoreRef;
import com.arkindustries.amezo.identity.api.StoreRefQuery;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Identity's read-only answer to "name this seller's store", for the features that
 * print "sold by X" and link to /stores/{handle}.
 *
 * Read-only on purpose, and that is the whole difference between this and
 * SellerStoreService: that one provisions a missing store, because the seller is
 * looking at their own empty settings page. This one is called while rendering
 * somebody ELSE'S record, and a read that writes would mean a buyer opening a
 * refund creates the seller's storefront as a side effect. A seller with no row
 * yet is named from their own account instead, and the row is still created the
 * first time they open Store Settings.
 *
 * {@code handle} falls back to null rather than to a guess. A StoreRef with no
 * handle is a store that cannot be linked to yet, which is true; a handle
 * invented here would not match the one provisioning later assigns, and the link
 * would 404.
 */
@Service
class StoreRefService implements StoreRefQuery {

    private final SellerRepository sellers;
    private final SellerStoreRepository stores;

    StoreRefService(SellerRepository sellers, SellerStoreRepository stores) {
        this.sellers = sellers;
        this.stores = stores;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<StoreRef> findBySellerId(UUID sellerId) {
        Optional<SellerStore> store = stores.findBySellerId(sellerId);
        if (store.isPresent()) {
            return store.map(StoreRefService::fromStore);
        }
        return sellers.findById(sellerId).map(StoreRefService::fromSeller);
    }

    /**
     * One query for the sellers, then one indexed lookup per DISTINCT seller.
     *
     * Not a single findBySellerIdIn: adding a method to SellerStoreRepository
     * during a pass in which another agent is working in that file is a collision
     * for no gain here. The set is tiny and bounded by construction - the seller's
     * own refund queue has exactly one seller in it, and a buyer's list has one per
     * store they have bought from on that page - and each lookup uses
     * seller_store's UNIQUE(seller_id) index. Worth revisiting if a caller ever
     * arrives with hundreds.
     */
    @Override
    @Transactional(readOnly = true)
    public Map<UUID, StoreRef> findBySellerIds(Collection<UUID> sellerIds) {
        if (sellerIds.isEmpty()) {
            return Map.of();
        }
        Set<UUID> distinct = new LinkedHashSet<>(sellerIds);
        Map<UUID, Seller> sellersById = sellers.findAllById(distinct).stream()
                .collect(Collectors.toMap(Seller::getId, Function.identity(), (a, b) -> a));

        Map<UUID, StoreRef> refs = new HashMap<>();
        for (UUID sellerId : distinct) {
            Optional<SellerStore> store = stores.findBySellerId(sellerId);
            if (store.isPresent()) {
                refs.put(sellerId, fromStore(store.get()));
            } else {
                Seller seller = sellersById.get(sellerId);
                if (seller != null) {
                    refs.put(sellerId, fromSeller(seller));
                }
            }
        }
        return refs;
    }

    private static StoreRef fromStore(SellerStore store) {
        return new StoreRef(store.getSellerId(), store.getName(), store.getHandle());
    }

    private static StoreRef fromSeller(Seller seller) {
        return new StoreRef(seller.getId(), SellerDisplayName.of(seller), null);
    }
}
