package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.api.PublicStoreProfile;
import com.arkindustries.amezo.identity.api.PublicStoreQuery;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Identity's read-only answer for the public storefront - see {@link PublicStoreQuery}.
 *
 * Package-private, like every other implementation here: the caller depends on the
 * interface in {@code identity.api} and never on this class.
 *
 * It does not provision, and that is the whole difference between it and
 * SellerStoreService. That one creates a missing store row because the seller is
 * looking at their own empty settings page. This one is reached by a shopper opening
 * somebody else's URL, and a read that writes would mean anyone on the internet
 * creating store rows by guessing handles.
 */
@Service
class PublicStoreService implements PublicStoreQuery {

    private final SellerStoreRepository stores;
    private final SellerRepository sellers;

    PublicStoreService(SellerStoreRepository stores, SellerRepository sellers) {
        this.stores = stores;
        this.sellers = sellers;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PublicStoreProfile> findByHandle(String handle) {
        if (handle == null || handle.isBlank()) {
            return Optional.empty();
        }
        return stores.findByHandle(handle.trim()).map(this::toProfile);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PublicStoreProfile> findOpenBySellerIds(Collection<UUID> sellerIds) {
        if (sellerIds == null || sellerIds.isEmpty()) {
            return List.of();
        }
        return stores.findBySellerIdInAndStatus(sellerIds, StoreStatus.OPEN).stream()
                .map(this::toProfile)
                .toList();
    }

    private PublicStoreProfile toProfile(SellerStore store) {
        // "Since 2021" is about the seller, not the store row: a store provisioned
        // lazily on first read (see V18) would otherwise date the shop to whenever
        // its owner first opened Store settings.
        java.time.Instant joinedAt = sellers.findById(store.getSellerId())
                .map(Seller::getCreatedAt)
                .orElse(null);

        return new PublicStoreProfile(
                store.getSellerId(),
                store.getName(),
                store.getHandle(),
                store.getTagline(),
                store.getLocation(),
                store.getAbout(),
                store.getCoverUrl(),
                store.getLogoUrl(),
                store.getStatus().name(),
                store.getVacationNote(),
                joinedAt);
    }
}
