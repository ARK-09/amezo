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

    @Column(nullable = false)
    private String category;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
