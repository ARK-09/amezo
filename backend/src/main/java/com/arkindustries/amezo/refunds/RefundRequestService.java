package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.common.exception.UnprocessableEntityException;
import com.arkindustries.amezo.identity.api.CurrentBuyer;
import com.arkindustries.amezo.identity.api.SellerIdentityQuery;
import com.arkindustries.amezo.orders.api.OrderRefundContext;
import com.arkindustries.amezo.orders.api.OrderRefundContextQuery;
import com.arkindustries.amezo.orders.api.OrderRefundLine;
import com.arkindustries.amezo.refunds.api.RefundWindowPolicy;
import com.arkindustries.amezo.refunds.dto.CreateRefundRequestRequest;
import com.arkindustries.amezo.refunds.dto.RefundRequestDetailResponse;
import com.arkindustries.amezo.refunds.dto.RefundRequestPageResponse;
import com.arkindustries.amezo.refunds.dto.RefundRequestSummaryResponse;
import com.arkindustries.amezo.refunds.dto.UpdateRefundRequestRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The refund domain: raising a request, reading one, and every transition it can
 * make.
 *
 * <h2>It records decisions; it does not move money</h2>
 *
 * There is no payment system in this codebase - no payment table, no gateway, no
 * ledger, and checkout captures nothing. "Refund" here means a seller has decided
 * an amount is owed and when; nothing in this class calls out to anything, and
 * REFUNDED is a state, not a receipt. That is stated plainly rather than hidden
 * behind a method named releaseFunds().
 *
 * <h2>Authorization</h2>
 *
 * A buyer may only act on their own order; a seller may only decide on requests
 * against lines they sold. Both are enforced by the LOAD, not by a check after it:
 * {@link #requireForBuyer} and {@link #requireForSeller} throw
 * {@link NotFoundException} for somebody else's id, which is this repo's
 * convention (SellerOrderService, SellerProductService) - a 403 would confirm the
 * record exists to a caller with no right to know.
 *
 * <h2>Concurrency</h2>
 *
 * Every write goes through {@link #transition}, and the entity carries a
 * {@code @Version}. Two decisions racing on the same row means the second
 * transaction fails its version check, which is turned into the same 409 an illegal
 * transition gets - the seller retries and sees the state the other tab left.
 */
@Service
public class RefundRequestService {

    private final RefundRequestRepository requests;
    private final RefundRequestLineRepository lines;
    private final RefundEventRepository events;
    private final RefundAssembler assembler;
    private final OrderRefundContextQuery orders;
    private final RefundWindowPolicy window;
    private final CurrentBuyer currentBuyer;
    private final SellerIdentityQuery sellerIdentity;

    RefundRequestService(
            RefundRequestRepository requests,
            RefundRequestLineRepository lines,
            RefundEventRepository events,
            RefundAssembler assembler,
            OrderRefundContextQuery orders,
            RefundWindowPolicy window,
            CurrentBuyer currentBuyer,
            SellerIdentityQuery sellerIdentity) {
        this.requests = requests;
        this.lines = lines;
        this.events = events;
        this.assembler = assembler;
        this.orders = orders;
        this.window = window;
        this.currentBuyer = currentBuyer;
        this.sellerIdentity = sellerIdentity;
    }

    // ------------------------------------------------------------------- create

    /**
     * POST /api/v1/refund-requests. The buyer's Refund Request form.
     *
     * The checks, in the order they are cheapest to make, and every one of them a
     * refusal the contract or the handoff names:
     *
     * <ol>
     *   <li>the order exists and is the caller's own - 404 either way, because
     *       "someone else's order" must not read differently from "no such order";
     *   <li>the return window is still open - 422;
     *   <li>every requested line is really on that order - 422;
     *   <li>all of them belong to ONE seller - 422, because a request has one
     *       seller who owes it and there is no honest way to pick;
     *   <li>no line is already inside a live request - 409;
     *   <li>the quantity asked for is available - 422;
     *   <li>a payout is named when money is being asked for - 422.
     * </ol>
     *
     * The amount is then computed from the order's own purchase-time prices. It is
     * never taken from the client: an amount the buyer could send would be an
     * over-refund waiting to happen.
     */
    @Transactional
    public RefundRequestDetailResponse create(CreateRefundRequestRequest request) {
        UUID buyerId = currentBuyer.buyerIdentityId();
        Instant now = Instant.now();

        OrderRefundContext order = orders.findContext(request.orderId())
                .filter(context -> context.buyerIdentityId().equals(buyerId))
                .orElseThrow(() -> new NotFoundException("Order " + request.orderId() + " not found"));

        if (!window.isOpenAt(order.placedAt(), now)) {
            throw unprocessable(
                    "return-window-closed",
                    "Return window closed",
                    "The return window for order " + RefundReferences.orderReference(order.orderId())
                            + " closed on " + window.endsAt(order.placedAt()) + ".",
                    "orderId",
                    "past the return window");
        }

        Map<UUID, OrderRefundLine> orderLines = order.lines().stream()
                .collect(Collectors.toMap(OrderRefundLine::orderLineId, Function.identity()));

        // A duplicated orderLineId would otherwise be two rows claiming the same
        // line, which the per-request UNIQUE in V21 refuses with a 500-shaped
        // constraint violation rather than a refusal anybody documented.
        Set<UUID> requestedLineIds = new LinkedHashSet<>();
        for (CreateRefundRequestRequest.Line line : request.lines()) {
            if (!requestedLineIds.add(line.orderLineId())) {
                throw unprocessable(
                        "duplicate-line",
                        "Duplicate line",
                        "Order line " + line.orderLineId() + " is listed twice. Say quantity 2 instead.",
                        "lines",
                        "listed twice");
            }
            if (!orderLines.containsKey(line.orderLineId())) {
                throw unprocessable(
                        "line-not-on-order",
                        "Line not on this order",
                        "Order line " + line.orderLineId() + " is not on order "
                                + RefundReferences.orderReference(order.orderId()) + ".",
                        "lines",
                        "not on this order");
            }
            if (line.quantity() == null || line.quantity() < 1) {
                throw unprocessable(
                        "invalid-quantity",
                        "Invalid quantity",
                        "Quantity must be at least 1.",
                        "lines",
                        "must be at least 1");
            }
        }

        // One seller per request. An order can hold lines from several (see Order's
        // own note on why seller_id is nullable), and a refund is owed by whoever
        // sold the line - so a request spanning two sellers has two answers to
        // "who decides this", and the buyer is asked to raise one each instead.
        Set<UUID> sellerIds = requestedLineIds.stream()
                .map(id -> orderLines.get(id).sellerId())
                .collect(Collectors.toSet());
        if (sellerIds.size() > 1) {
            throw unprocessable(
                    "multiple-sellers",
                    "Items from different sellers",
                    "These items were sold by " + sellerIds.size()
                            + " different sellers. Raise one request per seller.",
                    "lines",
                    "from more than one seller");
        }
        UUID sellerId = sellerIds.iterator().next();

        Set<UUID> alreadyOpen = lines.findByOrderLineIdInAndOpenIsTrue(requestedLineIds).stream()
                .map(RefundRequestLine::getOrderLineId)
                .collect(Collectors.toSet());
        if (!alreadyOpen.isEmpty()) {
            throw new ConflictException(
                    URI.create("https://api/errors/refund-already-open"),
                    "Refund already open",
                    alreadyOpen.size() + " of these items already have a refund request open.",
                    List.of(new ConflictException.FieldError("lines", "already under an open request")));
        }

        // Settled requests still hold their units unless they were released, so a
        // buyer refunded one of two may come back for the other and not for three.
        Map<UUID, Integer> claimed = claimedQuantities(requestedLineIds);
        for (CreateRefundRequestRequest.Line line : request.lines()) {
            OrderRefundLine source = orderLines.get(line.orderLineId());
            int available = source.quantity() - claimed.getOrDefault(line.orderLineId(), 0);
            if (line.quantity() > available) {
                throw unprocessable(
                        "quantity-unavailable",
                        "Quantity unavailable",
                        "Only " + available + " of that item can still be returned; "
                                + line.quantity() + " were asked for.",
                        "lines",
                        "more than remains returnable");
            }
        }

        if (request.resolution() == RefundResolution.REFUND && request.payout() == null) {
            throw unprocessable(
                    "payout-required",
                    "Payout required",
                    "A refund needs to know where the money goes.",
                    "payout",
                    "required when asking for a refund");
        }

        BigDecimal requestedAmount = request.lines().stream()
                .map(line -> orderLines.get(line.orderLineId()).unitPrice()
                        .multiply(BigDecimal.valueOf(line.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Cannot fire given the checks above - every line is on the order and every
        // quantity is within what remains - but an amount above the order's own
        // total is the one thing that must never be storable, so it is asserted
        // rather than assumed.
        if (requestedAmount.compareTo(order.total()) > 0) {
            throw unprocessable(
                    "amount-exceeds-order",
                    "Amount exceeds the order",
                    "A refund of " + requestedAmount + " is more than the order's " + order.total() + ".",
                    "lines",
                    "more than the order total");
        }
        if (requestedAmount.signum() <= 0) {
            throw unprocessable(
                    "amount-not-positive",
                    "Nothing to refund",
                    "The selected items come to " + requestedAmount + ".",
                    "lines",
                    "come to nothing");
        }

        RefundRequest saved = requests.save(RefundRequest.builder()
                .reference(mintReference())
                .orderId(order.orderId())
                .buyerIdentityId(buyerId)
                .sellerId(sellerId)
                .status(RefundStatus.REQUESTED)
                .requestedResolution(request.resolution())
                .resolution(request.resolution())
                // Null for a replacement even if the client sent one: a replacement
                // moves no money, so a payout on it is meaningless and V21 is
                // indifferent to it. Storing it would be a field nothing reads.
                .payout(request.resolution() == RefundResolution.REFUND ? request.payout() : null)
                .detail(request.detail().trim())
                .requestedAmount(requestedAmount)
                .currency(CURRENCY)
                .requestedAt(now)
                .build());

        for (CreateRefundRequestRequest.Line line : request.lines()) {
            OrderRefundLine source = orderLines.get(line.orderLineId());
            lines.save(RefundRequestLine.builder()
                    .refundRequestId(saved.getId())
                    .orderLineId(line.orderLineId())
                    .quantity(line.quantity())
                    // Open from birth: REQUESTED is not terminal, and this is the
                    // column V21's partial unique index locks the line with.
                    .open(true)
                    .unitPriceSnapshot(source.unitPrice())
                    .lineTotal(source.unitPrice().multiply(BigDecimal.valueOf(line.quantity())))
                    .build());
        }

        // The buyer raising it is the first step of the history, so the timeline is
        // never empty and never has to be reconstructed from the timestamps.
        appendEvent(saved, RefundStatus.REQUESTED, null, now);

        try {
            // Inside the transaction, so the partial unique index's refusal becomes
            // the documented 409 rather than escaping as a 500 at commit. This is
            // the race the read above cannot close: two tabs both see no open
            // request and both insert.
            requests.flush();
            lines.flush();
        } catch (DataIntegrityViolationException e) {
            throw new ConflictException(
                    URI.create("https://api/errors/refund-already-open"),
                    "Refund already open",
                    "One of these items already has a refund request open.",
                    List.of(new ConflictException.FieldError("lines", "already under an open request")));
        }

        return assembler.detail(saved);
    }

    // --------------------------------------------------------------------- read

    /**
     * GET /api/v1/refund-requests/{id}. Readable by the buyer who raised it and by
     * the seller who owes it; 404 for anybody else, which is the same answer a
     * nonexistent id gets.
     */
    @Transactional(readOnly = true)
    public RefundRequestDetailResponse get(UUID refundRequestId) {
        return assembler.detail(requireVisible(refundRequestId));
    }

    /** GET /api/v1/refund-requests - the buyer's own list. */
    @Transactional(readOnly = true)
    public RefundRequestPageResponse listForBuyer(RefundStatus status, Pageable pageable) {
        UUID buyerId = currentBuyer.buyerIdentityId();
        Page<RefundRequest> page = status == null
                ? requests.findByBuyerIdentityIdOrderByRequestedAtDesc(buyerId, pageable)
                : requests.findByBuyerIdentityIdAndStatusOrderByRequestedAtDesc(buyerId, status, pageable);

        List<RefundRequestSummaryResponse> content = assembler.summaries(page.getContent());
        return new RefundRequestPageResponse(
                content, page.getNumber(), page.getTotalElements(), page.getTotalPages());
    }

    // --------------------------------------------------------------- transitions

    /**
     * PATCH /api/v1/refund-requests/{id}. The whole state machine, on the resource
     * rather than on action URLs.
     *
     * Who the caller is decides which moves exist: the seller owns every decision,
     * the buyer owns CANCELLED and only while nobody has decided. Both are resolved
     * before the transition is checked, so a buyer trying to approve their own
     * refund gets the 409 an illegal transition gets and never reaches the write.
     */
    @Transactional
    public RefundRequestDetailResponse update(UUID refundRequestId, UpdateRefundRequestRequest patch) {
        Actorship actorship = resolveActor(refundRequestId);
        RefundRequest request = actorship.request();
        RefundStatus from = request.getStatus();
        RefundStatus to = patch.status();

        if (!RefundTransitions.isLegal(actorship.actor(), from, to)) {
            throw new ConflictException(
                    URI.create("https://api/errors/illegal-refund-transition"),
                    "Illegal transition",
                    "A refund in " + from + " cannot move to " + to
                            + (actorship.actor() == RefundTransitions.Actor.BUYER
                                    ? " - the buyer may only cancel a request nobody has decided yet."
                                    : "."),
                    List.of(new ConflictException.FieldError("status", "not reachable from " + from)));
        }

        // The seller's chosen outcome, which need not be what the buyer asked for.
        // Applied BEFORE the transition's own rules so that "settle this replacement
        // request with money" is one PATCH rather than two.
        if (patch.resolution() != null) {
            request.setResolution(patch.resolution());
        }

        Instant now = Instant.now();
        applyTransition(request, from, to, patch, now);
        request.setStatus(to);

        // The denormalised flag V21's partial unique index is built on. Maintained
        // here and nowhere else, which is what makes "no two open requests cover the
        // same line" true: a settled request releases its lines, an undone approval
        // takes them back.
        boolean open = to.isOpen();
        List<RefundRequestLine> myLines = lines.findByRefundRequestIdOrderByCreatedAtAsc(request.getId());
        for (RefundRequestLine line : myLines) {
            line.setOpen(open);
        }
        lines.saveAll(myLines);

        appendEvent(request, to, trimmedNote(patch.note()), now);

        try {
            requests.saveAndFlush(request);
        } catch (OptimisticLockingFailureException e) {
            // Somebody else decided this request between the read above and here.
            // The same 409 an illegal transition gets, because from the caller's
            // point of view it is the same thing: the state they decided against is
            // no longer the state it is in.
            throw new ConflictException(
                    URI.create("https://api/errors/refund-changed-elsewhere"),
                    "Refund already decided",
                    "This request was decided somewhere else a moment ago. Reload it and look again.",
                    List.of());
        } catch (DataIntegrityViolationException e) {
            // Reopening an approval whose line has since been claimed by a newer
            // request: the partial unique index refuses it, and that refusal is a
            // real conflict rather than a server fault.
            throw new ConflictException(
                    URI.create("https://api/errors/refund-already-open"),
                    "Refund already open",
                    "Another open request now covers one of these items, so this one cannot be reopened.",
                    List.of(new ConflictException.FieldError("status", "line is under another request")));
        }

        return assembler.detail(request);
    }

    /**
     * Everything a transition writes besides the status itself: the timestamp of the
     * step, the fields it requires, and - on an undo - the fields it must clear.
     */
    private void applyTransition(
            RefundRequest request,
            RefundStatus from,
            RefundStatus to,
            UpdateRefundRequestRequest patch,
            Instant now) {

        if (RefundTransitions.isUndo(from, to)) {
            // "Undo approval". The approval's own facts go with it: an amount and a
            // return label left behind would outlive the decision that set them, and
            // the next approval would look like it had already happened.
            request.setApprovedAmount(null);
            request.setApprovedAt(null);
            request.setReturnTrackingNumber(null);
            // The buyer's original ask stands again. Without this, undoing an
            // approval that had switched the resolution would leave the request
            // claiming an outcome nobody chose.
            request.setResolution(request.getRequestedResolution());
            return;
        }

        switch (to) {
            case APPROVED, AWAITING_RETURN -> {
                request.setApprovedAmount(approvedAmount(request, patch));
                request.setApprovedAt(now);
                if (patch.returnTrackingNumber() != null && !patch.returnTrackingNumber().isBlank()) {
                    request.setReturnTrackingNumber(patch.returnTrackingNumber().trim());
                }
                // Deliberately no else branch. This application does not mint a
                // return label: there is no carrier integration, and a
                // plausible-looking number would tell the buyer a prepaid label
                // exists when none does. The UI omits the sentence when it is null.
            }
            case DECLINED -> {
                String reason = trimmedNote(patch.declineReason());
                if (reason == null) {
                    throw unprocessable(
                            "decline-reason-required",
                            "Reason required",
                            "Declining a refund has to say why - the buyer is shown it.",
                            "declineReason",
                            "required when declining");
                }
                request.setDeclineReason(reason);
                request.setDeclinedAt(now);
            }
            case RETURN_RECEIVED -> request.setReturnReceivedAt(now);
            case REFUNDED -> {
                // Approving is what sets the amount, and RETURN_RECEIVED is only
                // reachable through an approval - so this is a guard against a
                // future path that skipped one, not a case the current graph allows.
                if (request.getApprovedAmount() == null) {
                    throw unprocessable(
                            "approval-required",
                            "Nothing approved",
                            "A refund cannot be released before an amount has been approved.",
                            "status",
                            "no approved amount");
                }
                // Recording only. No money moves: there is no payment system here.
                request.setRefundedAt(now);
            }
            case REPLACEMENT_SENT -> {
                if (request.getResolution() != RefundResolution.REPLACEMENT) {
                    throw unprocessable(
                            "not-a-replacement",
                            "Not a replacement",
                            "This request is being settled as a refund. Send resolution REPLACEMENT with"
                                    + " this transition to settle it with a parcel instead.",
                            "resolution",
                            "must be REPLACEMENT to send one");
                }
                request.setReplacementSentAt(now);
            }
            case CANCELLED -> request.setCancelledAt(now);
            case REQUESTED -> throw new IllegalStateException(
                    "REQUESTED is only reachable as an undo, which returns above");
        }
    }

    /**
     * What the seller approved. Absent means the whole requested amount, which is
     * what the design's "Full $X" shortcut sends explicitly and what a client that
     * omits the field means.
     *
     * A PARTIAL amount is legitimate and is stored as given. An OVER-refund is not,
     * and it is refused here with the field named - the CHECK in V21 behind it is a
     * backstop for anything that skipped this method, not the error message.
     */
    private BigDecimal approvedAmount(RefundRequest request, UpdateRefundRequestRequest patch) {
        BigDecimal amount = patch.approvedAmount();
        if (amount == null) {
            return request.getRequestedAmount();
        }
        if (amount.signum() <= 0) {
            throw unprocessable(
                    "amount-not-positive",
                    "Amount must be positive",
                    "An approved refund of " + amount + " is not an amount.",
                    "approvedAmount",
                    "must be more than zero");
        }
        if (amount.compareTo(request.getRequestedAmount()) > 0) {
            throw unprocessable(
                    "over-refund",
                    "More than was requested",
                    "Cannot approve " + amount + " against a request for "
                            + request.getRequestedAmount() + ".",
                    "approvedAmount",
                    "more than the requested amount");
        }
        return amount;
    }

    // ----------------------------------------------------------------- authority

    /** Which side of the refund the caller is on, and the request itself. */
    private record Actorship(RefundRequest request, RefundTransitions.Actor actor) {
    }

    /**
     * Resolve the caller against the request.
     *
     * The seller is checked first and deliberately: a session can only be one
     * identity type at a time, but the same person may hold both a seller and a
     * buyer account, and on their OWN store's refund they are the decider. Checking
     * the buyer first would hand a seller-on-their-own-order the buyer's single move
     * and refuse them every decision.
     */
    private Actorship resolveActor(UUID refundRequestId) {
        RefundRequest request = requests.findById(refundRequestId)
                .orElseThrow(() -> notFound(refundRequestId));

        Optional<UUID> sellerId = sellerIdentity.currentSellerId();
        if (sellerId.isPresent() && sellerId.get().equals(request.getSellerId())) {
            return new Actorship(request, RefundTransitions.Actor.SELLER);
        }
        if (sellerId.isPresent()) {
            // A signed-in seller looking at somebody else's refund. Not their
            // business and not their buyer account either.
            throw notFound(refundRequestId);
        }
        if (request.getBuyerIdentityId().equals(currentBuyer.buyerIdentityId())) {
            return new Actorship(request, RefundTransitions.Actor.BUYER);
        }
        throw notFound(refundRequestId);
    }

    /**
     * A request the caller is allowed to read: their own as a buyer, or one they owe
     * as a seller. Anyone else gets the 404 a nonexistent id gets, rather than a 403
     * that would confirm it exists.
     */
    private RefundRequest requireVisible(UUID refundRequestId) {
        RefundRequest request = requests.findById(refundRequestId)
                .orElseThrow(() -> notFound(refundRequestId));

        Optional<UUID> sellerId = sellerIdentity.currentSellerId();
        if (sellerId.isPresent()) {
            if (!sellerId.get().equals(request.getSellerId())) {
                throw notFound(refundRequestId);
            }
            return request;
        }
        if (!request.getBuyerIdentityId().equals(currentBuyer.buyerIdentityId())) {
            throw notFound(refundRequestId);
        }
        return request;
    }

    /** Used by the seller queue, which has already resolved whose it is. */
    RefundRequest requireForSeller(UUID refundRequestId, UUID sellerId) {
        RefundRequest request = requests.findById(refundRequestId)
                .orElseThrow(() -> notFound(refundRequestId));
        if (!request.getSellerId().equals(sellerId)) {
            throw notFound(refundRequestId);
        }
        return request;
    }

    RefundRequest requireForBuyer(UUID refundRequestId, UUID buyerIdentityId) {
        RefundRequest request = requests.findById(refundRequestId)
                .orElseThrow(() -> notFound(refundRequestId));
        if (!request.getBuyerIdentityId().equals(buyerIdentityId)) {
            throw notFound(refundRequestId);
        }
        return request;
    }

    // ------------------------------------------------------------------ helpers

    /**
     * Units of each line already claimed by a request that has not released them.
     * DECLINED and CANCELLED release theirs - nothing was returned and nothing was
     * paid - so those are excluded; every other status holds its units, open or
     * settled.
     */
    private Map<UUID, Integer> claimedQuantities(Set<UUID> orderLineIds) {
        List<RefundRequestLine> existing = lines.findByOrderLineIdIn(orderLineIds);
        if (existing.isEmpty()) {
            return Map.of();
        }
        Map<UUID, RefundStatus> statusByRequest =
                requests.findAllById(existing.stream()
                                .map(RefundRequestLine::getRefundRequestId)
                                .collect(Collectors.toSet()))
                        .stream()
                        .collect(Collectors.toMap(RefundRequest::getId, RefundRequest::getStatus));

        Map<UUID, Integer> claimed = new HashMap<>();
        for (RefundRequestLine line : existing) {
            RefundStatus status = statusByRequest.get(line.getRefundRequestId());
            if (status == RefundStatus.DECLINED || status == RefundStatus.CANCELLED) {
                continue;
            }
            claimed.merge(line.getOrderLineId(), line.getQuantity(), Integer::sum);
        }
        return claimed;
    }

    private void appendEvent(RefundRequest request, RefundStatus status, String note, Instant at) {
        Integer previous = events.maxSequenceNo(request.getId());
        events.save(RefundEventRecord.builder()
                .refundRequestId(request.getId())
                .status(status)
                .note(note)
                .occurredAt(at)
                .sequenceNo(previous == null ? 0 : previous + 1)
                .build());
    }

    /**
     * A unique reference. The retry is not paranoia: the reference is the first
     * eight hex digits of a fresh UUID, so a collision is remote but possible, and
     * the alternative to retrying is a 500 on an insert that would have worked.
     */
    private String mintReference() {
        for (int attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
            String candidate = RefundReferences.refundReference(UUID.randomUUID());
            if (!requests.existsByReference(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("Could not mint a unique refund reference");
    }

    private static NotFoundException notFound(UUID refundRequestId) {
        return new NotFoundException("Refund request " + refundRequestId + " not found");
    }

    private static UnprocessableEntityException unprocessable(
            String code, String title, String detail, String field, String reason) {
        return new UnprocessableEntityException(
                URI.create("https://api/errors/" + code),
                title,
                detail,
                List.of(new UnprocessableEntityException.FieldError(field, reason)));
    }

    private static String trimmedNote(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static final int REFERENCE_ATTEMPTS = 5;

    /**
     * The one currency this codebase has. There is no currency column on an order or
     * an offer to read a real one from, so it is written here rather than left for a
     * later migration to backfill from nothing.
     */
    static final String CURRENCY = "USD";
}
