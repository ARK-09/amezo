package com.arkindustries.amezo.identity.api;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * "Whose store is this, and what is it called?" - the question every buyer-facing
 * read of someone else's record has to answer, because the contract's
 * RefundRequestDetail.seller and BuyerOrderSummary.seller are both a StoreRef.
 *
 * An api-package interface for the usual reason: refunds and orders may not import
 * SellerStore, SellerStoreRepository or Seller, and PackageBoundaryTest fails the
 * build if they do.
 *
 * <h2>It never provisions</h2>
 *
 * SellerStoreService.getMine() creates a default store on first read, because the
 * seller is standing in front of Store Settings with nothing to edit. This is the
 * opposite situation - somebody else's store, read while rendering their record -
 * and writing a row as a side effect of that read would mean a buyer opening a
 * refund silently creates the seller's storefront. So a seller with no store row
 * yet is named from their own account instead, by the same derivation the
 * provisioner uses, and the row is still created the first time they open Store
 * Settings.
 */
public interface StoreRefQuery {

    /** Empty only when there is no such seller at all. */
    Optional<StoreRef> findBySellerId(UUID sellerId);

    /** Batched, keyed by seller id, unknown ids absent. For list reads. */
    Map<UUID, StoreRef> findBySellerIds(Collection<UUID> sellerIds);
}
