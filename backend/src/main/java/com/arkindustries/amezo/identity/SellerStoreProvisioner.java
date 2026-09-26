package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.common.exception.NotFoundException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Creates the default store for a seller who has never opened Store Settings.
 *
 * Why auto-provision at all: every seller has a storefront by definition - they
 * sell on it - so "no store yet" is not a 404, it is a store nobody has edited.
 * 404ing would leave the Store Settings page with nothing to seed its form from
 * and the dashboard's <h1> falling back to "Dashboard" forever, which is what it
 * did before this existed.
 *
 * A separate bean, and REQUIRES_NEW, for one specific reason: the insert can
 * lose a race (two tabs both open on a seller's first visit), and a constraint
 * violation inside the CALLER's transaction would mark that transaction
 * rollback-only, so the caller could not then read the row the winner wrote.
 * Its own transaction rolls back on its own, and the caller carries on and
 * re-reads. Self-invocation would not be proxied, hence a bean rather than a
 * private method on the service.
 */
@Component
class SellerStoreProvisioner {

    private final SellerStoreRepository stores;
    private final SellerRepository sellers;

    SellerStoreProvisioner(SellerStoreRepository stores, SellerRepository sellers) {
        this.stores = stores;
        this.sellers = sellers;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public SellerStore provision(UUID sellerId) {
        Seller seller = sellers.findById(sellerId)
                .orElseThrow(() -> new NotFoundException("Seller " + sellerId + " not found"));

        String name = defaultName(seller);
        // saveAndFlush, not save: a handle or seller_id collision has to surface
        // here, inside this transaction, as a DataIntegrityViolationException the
        // caller can catch. Deferred to commit it would escape the caller's
        // try/catch and reach the client as a 500.
        return stores.saveAndFlush(SellerStore.builder()
                .sellerId(sellerId)
                .name(name)
                .handle(StoreHandles.unique(name, stores::existsByHandle))
                .status(StoreStatus.OPEN)
                .build());
    }

    /**
     * The one thing a default store must get right: a name that is real.
     *
     * Derived from the seller's own record, never invented. Their full name if
     * the account has one - a sole trader's store is usually named after them,
     * and it is theirs to rename. Otherwise the local part of the email they
     * signed up with, which is the only other human-readable thing a seller
     * always has: seller.full_name is nullable and nothing captures it yet (see
     * V1__create_seller.sql), so in practice this is the branch that runs.
     *
     * The alternative - a placeholder like "My Store" - is the fake name the
     * dashboard's "Dashboard" fallback already was. This one is at least the
     * seller's own, and Store Settings exists to change it.
     */
    private static String defaultName(Seller seller) {
        String fullName = seller.getFullName();
        if (fullName != null && !fullName.isBlank()) {
            return fullName.trim();
        }
        String email = seller.getEmail();
        int at = email.indexOf('@');
        String localPart = at > 0 ? email.substring(0, at) : email;
        return localPart.isBlank() ? email : localPart;
    }
}
