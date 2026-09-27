package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.refunds.api.OrderRefundQuery;
import com.arkindustries.amezo.refunds.api.OrderRefundSnapshot;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Refunds' side of the order conversation, and the single writer of the fact that an
 * order has been refunded.
 *
 * <h2>No order row is ever written here</h2>
 *
 * Deliberately. The contract says REFUNDED is "derived, never written", and the
 * reason is that an order-level column a client could also set would be a second
 * source of truth that nothing reconciles the first time somebody settles a refund
 * from the queue rather than from the order. So this class answers the question and
 * the order's read path overlays the answer. There is no setStatus anywhere in this
 * feature, which is what makes the rule structural rather than a convention.
 *
 * SellerOrderTransition stays {@code [PACKED, SHIPPED, CANCELLED]}; nothing here
 * widens it.
 *
 * <h2>Two queries, whatever the page size</h2>
 *
 * Every method takes a collection, because every caller is a list. The snapshot
 * carries the order-line ids it covers, which live on a second table - so the reads
 * that build snapshots issue one query for the requests and one for their lines, and
 * never one pair per order.
 */
@Service
class OrderRefundQueryService implements OrderRefundQuery {

    private final RefundRequestRepository requests;
    private final RefundRequestLineRepository lines;

    OrderRefundQueryService(RefundRequestRepository requests, RefundRequestLineRepository lines) {
        this.requests = requests;
        this.lines = lines;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, List<OrderRefundSnapshot>> refundsByOrderIds(Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        List<RefundRequest> found = requests.findByOrderIdInOrderByRequestedAtAsc(orderIds);
        if (found.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<UUID>> lineIds = lineIdsByRequest(found);
        return found.stream().collect(Collectors.groupingBy(
                RefundRequest::getOrderId,
                Collectors.mapping(request -> toSnapshot(request, lineIds), Collectors.toList())));
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderRefundSnapshot> refundsForOrder(UUID orderId) {
        List<RefundRequest> found = requests.findByOrderIdOrderByRequestedAtAsc(orderId);
        if (found.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<UUID>> lineIds = lineIdsByRequest(found);
        return found.stream().map(request -> toSnapshot(request, lineIds)).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> refundedOrderIds(Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Set.of();
        }
        // REFUNDED only. REPLACEMENT_SENT is settled but moved a parcel rather than
        // money, and an order whose buyer got a replacement has not been refunded -
        // see the interface note.
        return requests.findByOrderIdInAndStatusIn(orderIds, List.of(RefundStatus.REFUNDED)).stream()
                .map(RefundRequest::getOrderId)
                .collect(Collectors.toSet());
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> orderIdsWithOpenRefund(Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Set.of();
        }
        return requests.findByOrderIdInAndStatusIn(orderIds, openStatuses()).stream()
                .map(RefundRequest::getOrderId)
                .collect(Collectors.toSet());
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, OrderRefundSnapshot> openRefundByOrderId(Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        List<RefundRequest> open = requests.findByOrderIdInAndStatusIn(orderIds, openStatuses());
        if (open.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<UUID>> lineIds = lineIdsByRequest(open);
        Map<UUID, OrderRefundSnapshot> newest = new HashMap<>();
        open.stream()
                // Oldest first, so the last write per order wins and the map holds
                // the newest. One order should only ever have one open request (V21's
                // partial unique index), but where its lines were split across two the
                // newest is the one a badge should show.
                .sorted(Comparator.comparing(RefundRequest::getRequestedAt)
                        .thenComparing(RefundRequest::getId))
                .forEach(request -> newest.put(request.getOrderId(), toSnapshot(request, lineIds)));
        return newest;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OrderRefundSnapshot> findById(UUID refundRequestId) {
        return requests.findById(refundRequestId)
                .map(request -> toSnapshot(request, lineIdsByRequest(List.of(request))));
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> orderLineIdsUnderOpenRequest(Collection<UUID> orderLineIds) {
        if (orderLineIds.isEmpty()) {
            return Set.of();
        }
        // Reads the same denormalised flag V21's partial unique index is built on, so
        // this answer and that constraint cannot disagree about what "open" means.
        return lines.findByOrderLineIdInAndOpenIsTrue(orderLineIds).stream()
                .map(RefundRequestLine::getOrderLineId)
                .collect(Collectors.toSet());
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, Integer> claimedQuantityByOrderLineId(Collection<UUID> orderLineIds) {
        if (orderLineIds.isEmpty()) {
            return Map.of();
        }
        List<RefundRequestLine> existing = lines.findByOrderLineIdIn(orderLineIds);
        if (existing.isEmpty()) {
            return Map.of();
        }
        // DECLINED and CANCELLED release their units: nothing was returned and nothing
        // was paid, so those items are returnable again. Every other status holds
        // them, open or settled.
        Set<UUID> released = new HashSet<>();
        requests.findAllById(existing.stream()
                        .map(RefundRequestLine::getRefundRequestId)
                        .collect(Collectors.toSet()))
                .forEach(request -> {
                    if (request.getStatus() == RefundStatus.DECLINED
                            || request.getStatus() == RefundStatus.CANCELLED) {
                        released.add(request.getId());
                    }
                });

        Map<UUID, Integer> claimed = new HashMap<>();
        for (RefundRequestLine line : existing) {
            if (released.contains(line.getRefundRequestId())) {
                continue;
            }
            claimed.merge(line.getOrderLineId(), line.getQuantity(), Integer::sum);
        }
        return claimed;
    }

    /** One query for every request's covered lines, keyed by request id. */
    private Map<UUID, List<UUID>> lineIdsByRequest(List<RefundRequest> forRequests) {
        return lines.findByRefundRequestIdIn(forRequests.stream().map(RefundRequest::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(
                        RefundRequestLine::getRefundRequestId,
                        Collectors.mapping(RefundRequestLine::getOrderLineId, Collectors.toList())));
    }

    /** The complement of RefundStatus.TERMINAL, so the two cannot drift apart. */
    private static List<RefundStatus> openStatuses() {
        return Arrays.stream(RefundStatus.values()).filter(RefundStatus::isOpen).toList();
    }

    private static OrderRefundSnapshot toSnapshot(
            RefundRequest request, Map<UUID, List<UUID>> lineIds) {
        return new OrderRefundSnapshot(
                request.getId(),
                request.getReference(),
                request.getOrderId(),
                request.getStatus().name(),
                request.getResolution().name(),
                request.getRequestedAt(),
                request.getRequestedAmount(),
                request.getApprovedAmount(),
                request.getCurrency(),
                request.getReturnTrackingNumber(),
                request.getStatus().isOpen(),
                request.getStatus() == RefundStatus.REFUNDED,
                lineIds.getOrDefault(request.getId(), List.of()));
    }
}
