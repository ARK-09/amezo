package com.arkindustries.amezo.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * A system-managed category. Sellers choose one; nobody types one. There is no
 * write endpoint on purpose - the list is seeded and migrated (see
 * V14__create_category_and_link_product.sql), which is what "system-provided"
 * means here.
 *
 * slug is the stable identity used in URLs, in the ?category= filter and in
 * product writes; name is display only, so renaming "Apparel" to "Clothing"
 * doesn't invalidate a single link or stored value. active retires a category
 * from the selector and the navigation without orphaning the products already
 * filed under it.
 */
@Entity
@Table(name = "category")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 100)
    private String slug;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(nullable = false)
    private boolean active;

    @Column(nullable = false)
    private int position;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
