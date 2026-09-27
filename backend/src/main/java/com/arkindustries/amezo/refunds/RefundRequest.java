package com.arkindustries.amezo.refunds;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One buyer's request for money back or a replacement, on one order.
 *
 * <h2>It does not move money</h2>
 *
 * There is no payment system in this codebase - no payment table, no gateway, no
 * ledger, and checkout captures no method. This row records a decision, an
 * amount, and when each was taken. {@code refundedAt} means "the seller released
 * this", not "a provider paid it out", and there is deliberately no provider
 * reference or settlement state to hold one. See V21's header.
 *
 * <h2>orderId is a real FK, unlike order_line's snapshots</h2>
 *
 * order_line copies product/variant/seller ids rather than referencing them,
 * because it is a historical record that must not follow the catalogue. A refund
 * is the opposite: it is a live negotiation about one specific order that still
 * exists, and an order that has gone has no refund left to decide.
 *
 * <h2>buyerIdentityId and sellerId are copied from the order</h2>
 *
 * Not normalisation drift - authorization. Every read of this row asks "is the
 * caller the buyer who raised it, or the seller who owes it?", and both sides of
 * that question are then one column comparison rather than a join through
 * orders and order_line on every request.
 */
@Entity
@Table(name = "refund_request")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefundRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** The short key the designs print ("ref_4d90b12c"). Stable and unique. */
    @Column(nullable = false, unique = true, length = 32)
    private String reference;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "buyer_identity_id", nullable = false)
    private UUID buyerIdentityId;

    @Column(name = "seller_id", nullable = false)
    private UUID sellerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RefundStatus status;

    /** What the buyer asked for. Never overwritten by the seller's answer. */
    @Enumerated(EnumType.STRING)
    @Column(name = "requested_resolution", nullable = false, length = 12)
    private RefundResolution requestedResolution;

    /**
     * What the request will actually be settled as. Starts equal to
     * {@link #requestedResolution} and moves only when the seller says so on a
     * decision - which the contract allows explicitly (UpdateRefundRequest's
     * resolution: "the outcome the SELLER settles on, which need not be the one
     * the buyer asked for").
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private RefundResolution resolution;

    /** Null for a replacement, which moves no money. V21 enforces that. */
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private RefundPayout payout;

    @Column(nullable = false, columnDefinition = "text")
    private String detail;

    /** Fixed when raised: the selected lines at their purchase-time prices. */
    @Column(name = "requested_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal requestedAmount;

    /**
     * What the seller approved - null until they do. Less than
     * {@link #requestedAmount} is a legitimate partial refund; more than it is
     * refused by the service with a 422 and by a CHECK behind it.
     */
    @Column(name = "approved_amount", precision = 10, scale = 2)
    private BigDecimal approvedAmount;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "decline_reason", columnDefinition = "text")
    private String declineReason;

    /**
     * Only ever what the seller supplied. This application never mints one:
     * there is no carrier integration, and an invented label number would tell
     * the buyer a prepaid label exists when none does.
     */
    @Column(name = "return_tracking_number", length = 64)
    private String returnTrackingNumber;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "declined_at")
    private Instant declinedAt;

    @Column(name = "return_received_at")
    private Instant returnReceivedAt;

    @Column(name = "refunded_at")
    private Instant refundedAt;

    @Column(name = "replacement_sent_at")
    private Instant replacementSentAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    /**
     * Optimistic locking. The state machine reads a status, decides a transition
     * is legal, then writes the next one - two concurrent decisions on the same
     * REQUESTED row would both pass that check and the later write would silently
     * win. With this, the second transaction fails and the service answers 409,
     * the same answer an illegal transition gets.
     */
    @Version
    @Column(nullable = false)
    private Long version;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** The amount at stake: what was approved if anything was, else what was asked. */
    public BigDecimal effectiveAmount() {
        return approvedAmount != null ? approvedAmount : requestedAmount;
    }
}
