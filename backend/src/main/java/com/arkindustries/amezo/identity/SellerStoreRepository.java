package com.arkindustries.amezo.identity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SellerStoreRepository extends JpaRepository<SellerStore, UUID> {

    Optional<SellerStore> findBySellerId(UUID sellerId);

    /**
     * The batched form, for SellerStoreRefQuery: a buyer's page of orders names
     * one storefront per order, and asking per seller would be a query per card.
     */
    List<SellerStore> findBySellerIdIn(Collection<UUID> sellerIds);

    /**
     * Exact match, not IgnoreCase, and that IS the contract's case-insensitive
     * lookup: StoreHandle admits lowercase only, both the request DTO and V18's
     * CHECK enforce it, so every stored and every submitted handle is already
     * lowercase. An exact match also uses the UNIQUE index, which lower(handle)
     * would not.
     */
    Optional<SellerStore> findByHandle(String handle);

    boolean existsByHandle(String handle);
}
