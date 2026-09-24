package com.arkindustries.amezo.identity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SellerRepository extends JpaRepository<Seller, UUID> {

    Optional<Seller> findByEmail(String email);
}
