package com.arkindustries.amezo.refunds;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface RefundRequestLineRepository extends JpaRepository<RefundRequestLine, UUID> {

    List<RefundRequestLine> findByRefundRequestIdOrderByCreatedAtAsc(UUID refundRequestId);

    // Batched: a queue page of 20 requests must not be 20 line queries.
    List<RefundRequestLine> findByRefundRequestIdIn(Collection<UUID> refundRequestIds);

    /**
     * Lines already inside a live request. Two callers:
     *
     *  - the create path, which refuses a second request against the same line
     *    (the 409 the contract promises); and
     *  - orders, through refunds.api, which greys out "Return or refund" on an
     *    order whose lines are all already under one.
     *
     * Reads the denormalised is_open flag, which is the same column V21's partial
     * unique index is built on - so the check and the constraint cannot disagree
     * about what "open" means.
     */
    List<RefundRequestLine> findByOrderLineIdInAndOpenIsTrue(Collection<UUID> orderLineIds);

    /**
     * Every quantity already claimed against these lines, whether the claiming
     * request is open or settled.
     *
     * Settled ones count too, and that is the point: a buyer who was refunded one
     * of two units may come back for the other, but not for three. Only a
     * DECLINED or CANCELLED request releases its quantity, so the caller filters
     * those out - which it has to do in Java anyway, since the status lives on the
     * parent row.
     */
    List<RefundRequestLine> findByOrderLineIdIn(Collection<UUID> orderLineIds);
}
