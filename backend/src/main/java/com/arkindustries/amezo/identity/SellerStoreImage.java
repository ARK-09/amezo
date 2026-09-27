package com.arkindustries.amezo.identity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * One uploaded (or reserved) storefront picture. The row that stands between
 * "an upload URL was signed" and "the storefront shows this image" - see V23.
 */
@Entity
@Table(name = "seller_store_image")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SellerStoreImage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "seller_store_id", nullable = false, updatable = false)
    private UUID sellerStoreId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private StoreImageSlot slot;

    @Column(name = "s3_key", nullable = false, updatable = false)
    private String s3Key;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private StoreImageStatus status;

    /**
     * The size the client declared at presign time, overwritten with the
     * bucket's own number on confirm. Nullable because a PENDING row's size is
     * a claim, and the claim is what the per-file cap was checked against.
     */
    @Column(name = "size_bytes")
    private Long sizeBytes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
