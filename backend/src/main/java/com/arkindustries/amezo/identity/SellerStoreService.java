package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.identity.api.CurrentSeller;
import com.arkindustries.amezo.identity.dto.StoreProfileResponse;
import com.arkindustries.amezo.identity.dto.UpdateStoreProfileRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The seller's own storefront profile: GET and PATCH
 * /api/v1/sellers/me/store.
 *
 * One service for both because they are one entity and one set of rules - the
 * read is what the write returns, and a read endpoint on its own would have
 * shown every seller an empty store with no way to fill it in.
 *
 * Neither method takes a seller id. The route is under /api/v1/sellers/me/**,
 * which SecurityConfig scopes to hasRole("SELLER"), so the subject is whoever
 * the session cookie names and there is no id to get wrong: cross-seller
 * isolation is a property of the query, not of a check that could be forgotten.
 */
@Service
public class SellerStoreService {

    /**
     * Two, not one. The first retry covers the ordinary race - another request
     * created this seller's store between the read and the insert - which the
     * re-read below resolves. The second covers the rarer case where the
     * collision was on the HANDLE rather than on seller_id (two sellers whose
     * default names slug the same, provisioning at the same moment): re-reading
     * finds nothing, and the next attempt recomputes the handle against a
     * database that now contains the winner's.
     */
    private static final int PROVISION_ATTEMPTS = 2;

    private final SellerStoreRepository stores;
    private final SellerStoreProvisioner provisioner;
    private final CurrentSeller currentSeller;

    SellerStoreService(
            SellerStoreRepository stores,
            SellerStoreProvisioner provisioner,
            CurrentSeller currentSeller) {
        this.stores = stores;
        this.provisioner = provisioner;
        this.currentSeller = currentSeller;
    }

    /**
     * Deliberately not @Transactional. The read is a single query, and the
     * provisioning path underneath it runs in the provisioner's own transaction
     * - wrapping both in a read-only one here would only add a transaction for
     * the inner write to suspend.
     */
    public StoreProfileResponse getMine() {
        return toResponse(requireStore(currentSeller.sellerId()));
    }

    @Transactional
    public StoreProfileResponse updateMine(UpdateStoreProfileRequest request) {
        SellerStore store = requireStore(currentSeller.sellerId());

        // Every field: null means the seller did not touch it. See
        // UpdateStoreProfileRequest for why blank is a different answer.
        if (request.name() != null) {
            store.setName(request.name().trim());
        }
        if (request.handle() != null) {
            store.setHandle(requireHandleFree(request.handle(), store.getId()));
        }
        if (request.tagline() != null) {
            store.setTagline(clearedIfBlank(request.tagline()));
        }
        if (request.location() != null) {
            store.setLocation(clearedIfBlank(request.location()));
        }
        if (request.foundedYear() != null) {
            store.setFoundedYear(request.foundedYear());
        }
        if (request.supportEmail() != null) {
            store.setSupportEmail(clearedIfBlank(request.supportEmail()));
        }
        if (request.about() != null) {
            store.setAbout(clearedIfBlank(request.about()));
        }
        if (request.coverUrl() != null) {
            store.setCoverUrl(clearedIfBlank(request.coverUrl()));
        }
        if (request.logoUrl() != null) {
            store.setLogoUrl(clearedIfBlank(request.logoUrl()));
        }
        if (request.status() != null) {
            store.setStatus(request.status());
        }
        if (request.vacationNote() != null) {
            store.setVacationNote(clearedIfBlank(request.vacationNote()));
        }

        // saveAndFlush, and the response is mapped from what it RETURNS, not
        // from the instance above. Two separate traps, both of which show up as
        // a correct row behind a stale response body:
        //   - @UpdateTimestamp assigns updated_at during the flush, so without
        //     an explicit one the response carries the pre-write timestamp and
        //     the form that just saved shows the old "last updated";
        //   - when the store was provisioned moments ago in the provisioner's
        //     own transaction, this instance is detached, so save() merges and
        //     the timestamp lands on the merged copy, not on this one.
        return toResponse(stores.saveAndFlush(store));
    }

    /**
     * This seller's store, creating the default one if this is the first thing
     * that ever asked for it.
     */
    private SellerStore requireStore(UUID sellerId) {
        Optional<SellerStore> existing = stores.findBySellerId(sellerId);
        if (existing.isPresent()) {
            return existing.get();
        }

        DataIntegrityViolationException lastRace = null;
        for (int attempt = 0; attempt < PROVISION_ATTEMPTS; attempt++) {
            try {
                return provisioner.provision(sellerId);
            } catch (DataIntegrityViolationException race) {
                lastRace = race;
                Optional<SellerStore> winner = stores.findBySellerId(sellerId);
                if (winner.isPresent()) {
                    return winner.get();
                }
            }
        }
        throw lastRace;
    }

    /**
     * The 409 the contract promises, naming the field that collided so the form
     * can mark it rather than showing a bare "conflict".
     *
     * Modelled on SellerProductService's sku-taken: a ConflictException with a
     * type URI and a FieldError, which ApiExceptionHandler turns into the shared
     * RFC 7807 body with an errors array. StoreSettings.tsx already reads it -
     * it looks for the entry whose field is "handle".
     *
     * Excluding the caller's own store matters: re-saving the form without
     * touching the URL sends the handle back unchanged, and that must not
     * collide with itself.
     */
    private String requireHandleFree(String handle, UUID ownStoreId) {
        stores.findByHandle(handle)
                .filter(other -> !other.getId().equals(ownStoreId))
                .ifPresent(clash -> {
                    throw new ConflictException(
                            URI.create("https://api/errors/handle-taken"),
                            "Handle already in use",
                            "Handle " + handle + " belongs to another store",
                            List.of(new ConflictException.FieldError("handle", "already in use")));
                });
        return handle;
    }

    /** Blank clears an optional field back to the null the contract calls for. */
    private static String clearedIfBlank(String value) {
        return value.isBlank() ? null : value.trim();
    }

    private static StoreProfileResponse toResponse(SellerStore store) {
        return new StoreProfileResponse(
                store.getId(),
                store.getName(),
                store.getHandle(),
                store.getTagline(),
                store.getLocation(),
                store.getFoundedYear(),
                store.getSupportEmail(),
                store.getAbout(),
                store.getCoverUrl(),
                store.getLogoUrl(),
                store.getStatus(),
                store.getVacationNote(),
                store.getUpdatedAt());
    }
}
