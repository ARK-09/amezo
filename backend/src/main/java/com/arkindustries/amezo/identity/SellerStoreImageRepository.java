package com.arkindustries.amezo.identity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SellerStoreImageRepository extends JpaRepository<SellerStoreImage, UUID> {

    /**
     * Every lookup is (store, slot) - see the index in V23. The store id is part
     * of the query rather than checked afterwards, which is what makes one
     * seller's confirm unable to name another seller's upload.
     */
    Optional<SellerStoreImage> findByIdAndSellerStoreId(UUID id, UUID sellerStoreId);

    List<SellerStoreImage> findBySellerStoreIdAndSlot(UUID sellerStoreId, StoreImageSlot slot);
}
