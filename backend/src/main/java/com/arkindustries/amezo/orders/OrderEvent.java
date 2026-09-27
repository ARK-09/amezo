package com.arkindustries.amezo.orders;

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
 * One recorded move along an order's fulfilment - see V25 for why this is a log
 * and not more columns on {@link Order}.
 *
 * {@code status} is a String, not {@link OrderStatus}: this is history, and a
 * status later retired from the live enum must not stop the row that records when
 * it happened from loading.
 */
@Entity
@Table(name = "order_event")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(nullable = false, length = 20)
    private String status;

    /** Null for a move the platform makes on its own rather than a seller. */
    @Column(name = "actor_seller_id")
    private UUID actorSellerId;

    /** When it happened, which the seller may backdate. */
    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(columnDefinition = "text")
    private String note;

    private Integer parcels;

    @Column(name = "packed_by", columnDefinition = "text")
    private String packedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "handover_method", length = 16)
    private HandoverMethod handoverMethod;

    @Column(columnDefinition = "text")
    private String hub;

    /** When we were told, as opposed to when it happened. */
    @CreationTimestamp
    @Column(name = "recorded_at", nullable = false, updatable = false)
    private Instant recordedAt;
}
