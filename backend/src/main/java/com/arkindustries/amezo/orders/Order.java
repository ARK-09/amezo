package com.arkindustries.amezo.orders;

import jakarta.persistence.AttributeOverride;
import jakarta.persistence.AttributeOverrides;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
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
 * sellerId is nullable (see V12's migration comment): checkout creates
 * one order per call regardless of how many sellers its lines belong to,
 * so this column is no longer a reliable single answer - order_line's
 * own seller_id_snapshot is the authoritative field, per line.
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

    @Column(name = "seller_id")
    private UUID sellerId;

    @Column(name = "buyer_email_snapshot", nullable = false)
    private String buyerEmailSnapshot;

    @Column(name = "buyer_phone", nullable = false)
    private String buyerPhone;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "fullName", column = @Column(name = "shipping_full_name")),
            @AttributeOverride(name = "line1", column = @Column(name = "shipping_line1")),
            @AttributeOverride(name = "line2", column = @Column(name = "shipping_line2")),
            @AttributeOverride(name = "city", column = @Column(name = "shipping_city")),
            @AttributeOverride(name = "state", column = @Column(name = "shipping_state")),
            @AttributeOverride(name = "postalCode", column = @Column(name = "shipping_postal_code")),
            @AttributeOverride(name = "country", column = @Column(name = "shipping_country"))
    })
    private Address shippingAddress;

    @Column(name = "billing_same_as_shipping", nullable = false)
    private boolean billingSameAsShipping;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "fullName", column = @Column(name = "billing_full_name")),
            @AttributeOverride(name = "line1", column = @Column(name = "billing_line1")),
            @AttributeOverride(name = "line2", column = @Column(name = "billing_line2")),
            @AttributeOverride(name = "city", column = @Column(name = "billing_city")),
            @AttributeOverride(name = "state", column = @Column(name = "billing_state")),
            @AttributeOverride(name = "postalCode", column = @Column(name = "billing_postal_code")),
            @AttributeOverride(name = "country", column = @Column(name = "billing_country"))
    })
    private Address billingAddress;

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
