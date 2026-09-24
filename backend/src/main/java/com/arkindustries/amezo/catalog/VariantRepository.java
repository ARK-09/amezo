package com.arkindustries.amezo.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface VariantRepository extends JpaRepository<Variant, UUID> {

    List<Variant> findByProductId(UUID productId);
}
