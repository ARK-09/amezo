package com.arkindustries.marketplace.catalog;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {

    /**
     * Full-text search over the generated search_vector column. Native
     * query because Spring Data JPQL has no tsvector/tsquery operators.
     * :query = null falls back to an unfiltered page, so this doubles as
     * the plain "list all products" query.
     */
    @Query(
        value = "SELECT * FROM product p " +
                "WHERE (:query IS NULL OR p.search_vector @@ plainto_tsquery('english', :query))",
        countQuery = "SELECT count(*) FROM product p " +
                "WHERE (:query IS NULL OR p.search_vector @@ plainto_tsquery('english', :query))",
        nativeQuery = true
    )
    Page<Product> search(@Param("query") String query, Pageable pageable);
}
