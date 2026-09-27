package com.arkindustries.amezo.refunds;

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

import java.time.Instant;
import java.util.UUID;

/**
 * One step of a refund's history: the status it moved to, when, and whatever was
 * written alongside the move.
 *
 * Named ...Record rather than RefundEvent because the DTO the contract calls
 * RefundEvent is the thing controllers return, and one name for the row and a
 * different one for the payload is how every other pair in this codebase reads
 * (Order/OrderResponse). This is the row.
 *
 * <h2>Why a log and not more timestamps</h2>
 *
 * refund_request already carries a timestamp per step, and they are the indexed
 * form used by list rows. They cannot hold the seller's message, though: the
 * decision panel writes an optional note on the same action that approves,
 * declines or sends a replacement, and the History timeline beside it prints that
 * note against that step. A single note column would be overwritten by the next
 * transition with no way to tell which step the survivor belonged to.
 *
 * It is also the only honest record of a step taken twice - "Undo approval" means
 * a request can be approved, walked back and approved again for a different
 * amount, and approvedAt can hold one of those three.
 */
@Entity
@Table(name = "refund_event")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefundEventRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "refund_request_id", nullable = false)
    private UUID refundRequestId;

    /** The status the request moved TO. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RefundStatus status;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    /**
     * Position within this request's history, 0 for the buyer raising it.
     *
     * Not redundant with occurredAt: two events can share a timestamp, and a
     * random UUID as the tiebreak would print them in either order. Assigned as
     * max + 1 inside the transition that appends it, which the parent's
     * {@code @Version} serialises.
     */
    @Column(name = "sequence_no", nullable = false)
    private Integer sequenceNo;
}
