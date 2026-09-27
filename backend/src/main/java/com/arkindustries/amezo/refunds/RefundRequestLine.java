package com.arkindustries.amezo.refunds;

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
 * Which of the order's lines a request covers, and how many of each. The buyer's
 * form is a checklist ("Pick only what you want to send back"), so a request is
 * not necessarily the whole order.
 */
@Entity
@Table(name = "refund_request_line")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefundRequestLine {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "refund_request_id", nullable = false)
    private UUID refundRequestId;

    @Column(name = "order_line_id", nullable = false)
    private UUID orderLineId;

    @Column(nullable = false)
    private Integer quantity;

    /**
     * Denormalised from the parent's status: true while the request is live.
     *
     * It exists for one reason - to make V21's partial unique index possible. A
     * partial index's predicate can only read columns of the table it is on, so
     * "no two open requests may cover the same order line" cannot be expressed
     * against refund_request.status from here. Without the index that rule is a
     * read-then-write check, and the 409 the contract promises is a race.
     *
     * Maintained in exactly one place, RefundRequestService's transition method,
     * which is also the only place a status is written.
     */
    @Column(name = "is_open", nullable = false)
    private boolean open;

    /** Copied at request time, for the same reason order_line copies its own. */
    @Column(name = "unit_price_snapshot", nullable = false, precision = 10, scale = 2)
    private BigDecimal unitPriceSnapshot;

    @Column(name = "line_total", nullable = false, precision = 10, scale = 2)
    private BigDecimal lineTotal;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
