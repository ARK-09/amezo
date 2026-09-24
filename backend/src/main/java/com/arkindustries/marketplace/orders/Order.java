package com.arkindustries.marketplace.orders;

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
 * Table is "orders", not the ADR's singular "order" - ORDER is a reserved
 * SQL keyword, and quoting it everywhere (migrations, native queries)
 * isn't worth it over the standard plural-table/singular-entity
 * convention already used everywhere else in this codebase.
 *
 * sellerId: one seller per order, per the checkout design in
 * docs/api-design.md - a multi-seller cart becomes N orders, one per
 * seller, never one order with mixed-ownership lines. This field wasn't
 * spelled out in the original ADR sketch; it's what makes that decision
 * concrete in the schema.
 */
@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "buyer_identity_id", nullable = false)
    private UUID buyerIdentityId;

    @Column(name = "seller_id", nullable = false)
    private UUID sellerId;

    @Column(name = "buyer_email_snapshot", nullable = false)
    private String buyerEmailSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private OrderStatus status;

    @Column(name = "tracking_number")
    private String trackingNumber;

    @Column(name = "shipped_at")
    private Instant shippedAt;

    @CreationTimestamp
    @Column(name = "placed_at", nullable = false, updatable = false)
    private Instant placedAt;
}
