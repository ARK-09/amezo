package com.arkindustries.amezo.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ImageRepository extends JpaRepository<Image, UUID> {

    // Top7 caps at the query level rather than fetching everything and
    // trimming in Java - 1..7 per product is meant to be enforced at
    // upload time (not built yet), so this is the defensive backstop.
    List<Image> findTop7ByProductIdAndStatusOrderByPositionAsc(UUID productId, ImageStatus status);

    // Batched thumbnail lookup for the seller's product list.
    List<Image> findByProductIdInAndStatusOrderByPositionAsc(Collection<UUID> productIds, ImageStatus status);

    void deleteByProductId(UUID productId);
}
