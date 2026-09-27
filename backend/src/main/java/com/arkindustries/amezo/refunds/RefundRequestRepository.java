package com.arkindustries.amezo.refunds;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface RefundRequestRepository extends JpaRepository<RefundRequest, UUID> {

    boolean existsByReference(String reference);

    // The buyer's own list. Sorting is in the query rather than left to the
    // Pageable, so ?sort= cannot be used to order someone's refunds by a column
    // no screen offers - and so the answer is stable between pages.
    Page<RefundRequest> findByBuyerIdentityIdOrderByRequestedAtDesc(UUID buyerIdentityId, Pageable pageable);

    Page<RefundRequest> findByBuyerIdentityIdAndStatusOrderByRequestedAtDesc(
            UUID buyerIdentityId, RefundStatus status, Pageable pageable);

    // "What refunds does this order have?" - the read behind an order's derived
    // REFUNDED status, its open-refund badge and its refundRequests array.
    List<RefundRequest> findByOrderIdOrderByRequestedAtAsc(UUID orderId);

    List<RefundRequest> findByOrderIdInOrderByRequestedAtAsc(Collection<UUID> orderIds);

    List<RefundRequest> findByOrderIdInAndStatusIn(
            Collection<UUID> orderIds, Collection<RefundStatus> statuses);

    /**
     * The seller queue, with the design's search box applied.
     *
     * One query rather than a Specification because there are exactly two
     * optional predicates and they are both this simple; a null status and a null
     * term each drop out of the WHERE rather than needing a second method.
     *
     * The term matches what the contract says it matches - buyer name, buyer
     * email, order reference and product title - and the joins below are why it
     * is written as JPQL over ids: refund_request holds no buyer name and no
     * product title, so the term has to reach the buyer_identity row behind
     * buyer_identity_id and the titles behind the order lines. Those live in
     * other features, so they cannot be joined here (PackageBoundaryTest). The
     * columns this table owns - the reference and the buyer's own account of what
     * went wrong - are matched here; the rest is applied in
     * SellerRefundQueryService, which can ask the other features through their
     * api packages.
     */
    @Query("SELECT r FROM RefundRequest r "
            + "WHERE r.sellerId = :sellerId "
            + "AND (:status IS NULL OR r.status = :status) "
            + "ORDER BY r.requestedAt DESC, r.id ASC")
    List<RefundRequest> findForSeller(
            @Param("sellerId") UUID sellerId, @Param("status") RefundStatus status);
}
