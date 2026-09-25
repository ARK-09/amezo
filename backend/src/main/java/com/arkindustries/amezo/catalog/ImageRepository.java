package com.arkindustries.amezo.catalog;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
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

    // Read before deleting: the rows carry the s3 keys, and once they're gone
    // there is nothing left to say which objects the bucket should lose.
    List<Image> findByProductId(UUID productId);

    // An image can hang off a variant instead of a product (the image table's
    // own CHECK allows either). Nothing creates those yet, but delete has to
    // cover them or variant deletion trips image.variant_id's foreign key.
    List<Image> findByVariantIdIn(Collection<UUID> variantIds);

    void deleteByProductId(UUID productId);

    void deleteByVariantIdIn(Collection<UUID> variantIds);

    /**
     * Bytes counting against the storage cap: everything already in the bucket,
     * plus the pending uploads whose presigned URL hasn't expired yet. The
     * pending half is a reservation - a URL handed out seconds ago can still be
     * PUT, so ignoring it would let a burst of concurrent requests each see the
     * same "room left" and collectively blow past the cap. Expired pendings drop
     * out on their own, so an abandoned upload stops holding quota instead of
     * leaking it forever.
     *
     * COALESCE because SUM over no rows is null, not 0, and size_bytes is null
     * for pre-V13 rows.
     */
    @Query("SELECT COALESCE(SUM(COALESCE(i.sizeBytes, 0)), 0) FROM Image i "
            + "WHERE i.status = com.arkindustries.amezo.catalog.ImageStatus.STORED "
            + "   OR (i.status = com.arkindustries.amezo.catalog.ImageStatus.PENDING "
            + "       AND i.createdAt > :pendingCutoff)")
    long sumStoredAndReservedBytes(@Param("pendingCutoff") Instant pendingCutoff);
}
