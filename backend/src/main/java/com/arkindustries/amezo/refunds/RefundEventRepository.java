package com.arkindustries.amezo.refunds;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface RefundEventRepository extends JpaRepository<RefundEventRecord, UUID> {

    /** The timeline, oldest first - the order the design's History reads in. */
    List<RefundEventRecord> findByRefundRequestIdOrderBySequenceNoAsc(UUID refundRequestId);

    /**
     * The next sequence number for this request. Null when there are no events
     * yet, which only happens before the first one is written.
     *
     * A MAX rather than a COUNT: an event log is append-only, but a COUNT would
     * silently reuse a number if a row were ever removed, and the UNIQUE
     * constraint would then reject the write instead of the log simply carrying a
     * gap.
     */
    @Query("SELECT MAX(e.sequenceNo) FROM RefundEventRecord e WHERE e.refundRequestId = :requestId")
    Integer maxSequenceNo(@Param("requestId") UUID requestId);
}
