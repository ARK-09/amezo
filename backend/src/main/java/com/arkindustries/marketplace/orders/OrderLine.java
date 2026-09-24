package com.arkindustries.marketplace.orders;

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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * productIdSnapshot / variantIdSnapshot / sellerIdSnapshot are
 * deliberately not foreign keys (see V10 migration) - they're historical
 * copies taken at purchase time and must never be coupled to whatever the
 * catalog says today. Only offerId is a real FK, kept for traceability
 * back to the live offer if ever needed.
 */
@Entity
@Table(name = "order_line")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderLine {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "offer_id", nullable = false)
    private UUID offerId;

    @Column(name = "product_id_snapshot", nullable = false)
    private UUID productIdSnapshot;

    @Column(name = "variant_id_snapshot", nullable = false)
    private UUID variantIdSnapshot;

    @Column(name = "seller_id_snapshot", nullable = false)
    private UUID sellerIdSnapshot;

    @Column(name = "unit_price_snapshot", nullable = false, precision = 10, scale = 2)
    private BigDecimal unitPriceSnapshot;

    @Column(nullable = false)
    private Integer quantity;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
