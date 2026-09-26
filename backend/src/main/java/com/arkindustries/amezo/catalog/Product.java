package com.arkindustries.amezo.catalog;

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
 * search_vector is deliberately NOT mapped here. It's a database-generated
 * (GENERATED ALWAYS AS ... STORED) tsvector column with no Hibernate-native
 * type, and the application never reads it as a value - only filters by it
 * in a native query (see ProductRepository.search). Mapping a column
 * Hibernate never needs to read or write would only invite a custom
 * UserType nobody benefits from.
 */
@Entity
@Table(name = "product")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "seller_id", nullable = false)
    private UUID sellerId;

    @Column(nullable = false)
    private String title;

    @Column(name = "brand_name")
    private String brandName;

    @Column(columnDefinition = "text")
    private String description;

    /**
     * The URL segment this product is reachable by, in place of its id. Generated
     * from the title once, at creation (Slugs.uniqueSlug), and then stable: a
     * later rename leaves it alone so existing links keep resolving.
     */
    @Column(nullable = false, unique = true)
    private String slug;

    /**
     * A plain id rather than a @ManyToOne. A page of sixteen cards would otherwise
     * be sixteen lazy loads, and CategoryService already hands out the whole
     * (dozen-row) table as one map for exactly that mapping step.
     */
    @Column(name = "category_id", nullable = false)
    private UUID categoryId;

    /**
     * Whether shoppers can see this listing. @Builder.Default because a product
     * built without one is a new listing the seller has not chosen a status for,
     * and the column's default (V17) is ACTIVE - without this, Lombok would pass
     * an explicit null and the insert would fail the NOT NULL rather than take
     * the default.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private ProductStatus status = ProductStatus.ACTIVE;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * Last write to this row, for the "Last updated" line in the seller's
     * product drawer. Hibernate-maintained rather than a database trigger, so
     * the value a write returns is the value that was stored.
     */
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
