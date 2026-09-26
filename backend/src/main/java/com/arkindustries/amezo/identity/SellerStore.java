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
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * A seller's storefront profile - the StoreProfile of the API contract.
 *
 * Lives in identity, not in a feature of its own, because identity already owns
 * seller and this row is a 1:1 extension of it: the FK, and the default name
 * and handle a new store is provisioned with, are all read out of the seller
 * record. A separate feature would have to reach back for them through a new
 * identity.api query to satisfy PackageBoundaryTest, which is machinery bought
 * for nothing.
 */
@Entity
@Table(name = "seller_store")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SellerStore {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** UNIQUE in V18 - one seller, one storefront. Never reassigned. */
    @Column(name = "seller_id", nullable = false, unique = true, updatable = false)
    private UUID sellerId;

    @Column(nullable = false)
    private String name;

    /**
     * The storefront's URL segment. Unique across stores; the format is
     * StoreHandles.PATTERN, enforced on the request DTO and again by V18's
     * CHECK constraint.
     */
    @Column(nullable = false, length = 39)
    private String handle;

    private String tagline;

    private String location;

    /** When the business began - not when the seller joined Amezo. */
    @Column(name = "founded_year")
    private Integer foundedYear;

    @Column(name = "support_email")
    private String supportEmail;

    private String about;

    @Column(name = "cover_url")
    private String coverUrl;

    @Column(name = "logo_url")
    private String logoUrl;

    /**
     * @Builder.Default so a store built without one takes OPEN rather than
     * having Lombok pass an explicit null into a NOT NULL column - the same
     * trap Product.status documents.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private StoreStatus status = StoreStatus.OPEN;

    @Column(name = "vacation_note")
    private String vacationNote;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * Hibernate-maintained rather than a database trigger, so the value the
     * write returns is the value that was stored. It is assigned during the
     * FLUSH, not on the call to save() - every writer here therefore flushes
     * explicitly and maps the instance saveAndFlush gives back, or the response
     * carries the pre-write timestamp while the row has already moved.
     */
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
