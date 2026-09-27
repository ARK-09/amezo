package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.identity.api.BuyerIdentityLookup;
import com.arkindustries.amezo.identity.api.StoreRef;
import com.arkindustries.amezo.identity.api.StoreRefQuery;
import com.arkindustries.amezo.orders.api.OrderRefundContext;
import com.arkindustries.amezo.orders.api.OrderRefundContextQuery;
import com.arkindustries.amezo.orders.api.OrderRefundLine;
import com.arkindustries.amezo.refunds.dto.RefundEventResponse;
import com.arkindustries.amezo.refunds.dto.RefundRequestDetailResponse;
import com.arkindustries.amezo.refunds.dto.RefundRequestLineResponse;
import com.arkindustries.amezo.refunds.dto.RefundRequestSummaryResponse;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Turns stored refund requests into the contract's response shapes.
 *
 * Its whole job is to do that for a LIST in a fixed number of queries. A refund
 * row prints things refund_request does not store - the buyer's name, the product
 * titles behind the order lines, the order's placed date, the seller's store name -
 * and every one of them lives in another feature. Assembled one row at a time that
 * is five queries per row; assembled here it is five queries per page, because each
 * of those features exposes a batched lookup on its api package and this collects
 * the ids first.
 *
 * It reads and never writes, and it is the only place any response shape is built,
 * so the seller's queue, the buyer's list and both detail reads cannot disagree
 * about what a refund looks like.
 */
@Component
class RefundAssembler {

    private final RefundRequestLineRepository lines;
    private final RefundEventRepository events;
    private final OrderRefundContextQuery orders;
    private final ProductVariantSummaryQuery catalog;
    private final BuyerIdentityLookup buyers;
    private final StoreRefQuery stores;

    RefundAssembler(
            RefundRequestLineRepository lines,
            RefundEventRepository events,
            OrderRefundContextQuery orders,
            ProductVariantSummaryQuery catalog,
            BuyerIdentityLookup buyers,
            StoreRefQuery stores) {
        this.lines = lines;
        this.events = events;
        this.orders = orders;
        this.catalog = catalog;
        this.buyers = buyers;
        this.stores = stores;
    }

    /**
     * One page of summaries. Batched end to end: the lines for every request in one
     * query, the orders in one, the titles in one, the buyer names in one.
     */
    List<RefundRequestSummaryResponse> summaries(List<RefundRequest> requests) {
        if (requests.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<RefundRequestLine>> linesByRequest = linesFor(requests);
        Map<UUID, OrderRefundContext> contexts = orders.findContexts(
                requests.stream().map(RefundRequest::getOrderId).collect(Collectors.toSet()));
        Map<UUID, String> titles = titlesFor(linesByRequest.values(), contexts);
        Map<UUID, String> buyerNames = buyerNamesFor(requests);
        Map<UUID, String> buyerEmails = buyerEmailsFor(requests, contexts);

        return requests.stream()
                .map(request -> {
                    List<RefundRequestLine> myLines =
                            linesByRequest.getOrDefault(request.getId(), List.of());
                    return new RefundRequestSummaryResponse(
                            request.getId(),
                            request.getReference(),
                            request.getStatus(),
                            request.getResolution(),
                            request.getRequestedAt(),
                            request.getRequestedAmount(),
                            request.getApprovedAmount(),
                            request.getCurrency(),
                            request.getOrderId(),
                            RefundReferences.orderReference(request.getOrderId()),
                            request.getReturnTrackingNumber(),
                            buyerNames.get(request.getBuyerIdentityId()),
                            buyerEmails.get(request.getBuyerIdentityId()),
                            itemsLabel(myLines, contexts.get(request.getOrderId()), titles));
                })
                .toList();
    }

    /** One request, in full. The read behind both detail routes and every PATCH's answer. */
    RefundRequestDetailResponse detail(RefundRequest request) {
        List<RefundRequestLine> myLines =
                lines.findByRefundRequestIdOrderByCreatedAtAsc(request.getId());
        OrderRefundContext context = orders.findContext(request.getOrderId()).orElse(null);

        Map<UUID, OrderRefundLine> orderLines = context == null
                ? Map.of()
                : context.lines().stream()
                        .collect(Collectors.toMap(OrderRefundLine::orderLineId, Function.identity()));

        Map<UUID, String> titles = catalog.productTitlesByIds(
                orderLines.values().stream().map(OrderRefundLine::productId).toList());
        Map<UUID, String> variants = catalog.variantLabelsByIds(
                orderLines.values().stream().map(OrderRefundLine::variantId).toList());

        List<RefundRequestLineResponse> lineResponses = myLines.stream()
                .map(line -> {
                    OrderRefundLine source = orderLines.get(line.getOrderLineId());
                    return new RefundRequestLineResponse(
                            line.getOrderLineId(),
                            source == null
                                    ? REMOVED_PRODUCT
                                    : titles.getOrDefault(source.productId(), REMOVED_PRODUCT),
                            source == null
                                    ? REMOVED_VARIANT
                                    : variants.getOrDefault(source.variantId(), REMOVED_VARIANT),
                            line.getQuantity(),
                            line.getUnitPriceSnapshot(),
                            line.getLineTotal());
                })
                .toList();

        List<RefundEventResponse> timeline =
                events.findByRefundRequestIdOrderBySequenceNoAsc(request.getId()).stream()
                        .map(event -> new RefundEventResponse(
                                event.getStatus(), event.getOccurredAt(), event.getNote()))
                        .toList();

        StoreRef seller = stores.findBySellerId(request.getSellerId())
                // A refund cannot exist without a seller (V21 makes seller_id a
                // NOT NULL FK), so this is unreachable rather than a fallback -
                // but a StoreRef is required by the contract, and a
                // NoSuchElementException here would be a 500 on a read.
                .orElseGet(() -> new StoreRef(request.getSellerId(), "Unknown store", null));

        return new RefundRequestDetailResponse(
                request.getId(),
                request.getReference(),
                request.getStatus(),
                request.getResolution(),
                request.getRequestedResolution(),
                request.getPayout(),
                request.getDetail(),
                request.getRequestedAt(),
                request.getRequestedAmount(),
                request.getApprovedAmount(),
                request.getCurrency(),
                request.getOrderId(),
                RefundReferences.orderReference(request.getOrderId()),
                context == null ? null : context.placedAt(),
                buyers.findFullName(request.getBuyerIdentityId()).orElse(null),
                context == null ? null : context.buyerEmail(),
                seller,
                // Always null. Nothing in this codebase captures how an order was
                // paid - see the DTO's note.
                null,
                lineResponses,
                timeline,
                request.getApprovedAt(),
                request.getDeclinedAt(),
                request.getDeclineReason(),
                request.getReturnReceivedAt(),
                request.getRefundedAt(),
                request.getReplacementSentAt(),
                request.getReturnTrackingNumber());
    }

    /**
     * The searchable text of a request that this feature cannot match in SQL: the
     * buyer's name and email live in identity, the product titles in catalog. The
     * contract says the seller's ?q= matches all four of buyer name, buyer email,
     * order reference and product title, so the queue filters on this.
     *
     * Built for a whole page at once, same as the summaries.
     */
    Map<UUID, String> searchTextByRequestId(List<RefundRequest> requests) {
        if (requests.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<RefundRequestLine>> linesByRequest = linesFor(requests);
        Map<UUID, OrderRefundContext> contexts = orders.findContexts(
                requests.stream().map(RefundRequest::getOrderId).collect(Collectors.toSet()));
        Map<UUID, String> titles = titlesFor(linesByRequest.values(), contexts);
        Map<UUID, String> buyerNames = buyerNamesFor(requests);
        Map<UUID, String> buyerEmails = buyerEmailsFor(requests, contexts);

        Map<UUID, String> searchable = new HashMap<>();
        for (RefundRequest request : requests) {
            OrderRefundContext context = contexts.get(request.getOrderId());
            String text = String.join(" ",
                    nullToEmpty(buyerNames.get(request.getBuyerIdentityId())),
                    nullToEmpty(buyerEmails.get(request.getBuyerIdentityId())),
                    request.getReference(),
                    RefundReferences.orderReference(request.getOrderId()),
                    productTitles(linesByRequest.getOrDefault(request.getId(), List.of()), context, titles));
            searchable.put(request.getId(), text.toLowerCase());
        }
        return searchable;
    }

    // ------------------------------------------------------------- batched reads

    private Map<UUID, List<RefundRequestLine>> linesFor(List<RefundRequest> requests) {
        return lines.findByRefundRequestIdIn(requests.stream().map(RefundRequest::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(RefundRequestLine::getRefundRequestId));
    }

    /**
     * Product titles for every line of every request on the page, in one catalog
     * query. The product id is not on refund_request_line - it is on the ORDER
     * line the refund line points at - so the order contexts have to be resolved
     * first, which the callers have already done.
     */
    private Map<UUID, String> titlesFor(
            Collection<List<RefundRequestLine>> allLines, Map<UUID, OrderRefundContext> contexts) {
        Map<UUID, UUID> productByOrderLine = contexts.values().stream()
                .flatMap(context -> context.lines().stream())
                .collect(Collectors.toMap(
                        OrderRefundLine::orderLineId, OrderRefundLine::productId, (a, b) -> a));

        Set<UUID> productIds = new LinkedHashSet<>();
        for (List<RefundRequestLine> group : allLines) {
            for (RefundRequestLine line : group) {
                UUID productId = productByOrderLine.get(line.getOrderLineId());
                if (productId != null) {
                    productIds.add(productId);
                }
            }
        }
        return catalog.productTitlesByIds(productIds);
    }

    private Map<UUID, String> buyerNamesFor(List<RefundRequest> requests) {
        Map<UUID, String> names = new HashMap<>();
        for (UUID buyerId : requests.stream().map(RefundRequest::getBuyerIdentityId)
                .collect(Collectors.toCollection(LinkedHashSet::new))) {
            // findFullName is per-id and identity exposes no batch form. The set is
            // the distinct buyers on one page, and on the seller's queue that is
            // usually a handful; adding a batch method to identity's api during a
            // pass in which another agent is in that package is a collision for a
            // gain this does not need.
            buyers.findFullName(buyerId).ifPresent(name -> names.put(buyerId, name));
        }
        return names;
    }

    /**
     * The buyer's email, taken from the ORDER's buyer_email_snapshot rather than
     * from their identity row. That is what the order was placed with, which is the
     * address the seller corresponded on and the one the design's panel prints
     * beside the order reference.
     */
    private Map<UUID, String> buyerEmailsFor(
            List<RefundRequest> requests, Map<UUID, OrderRefundContext> contexts) {
        Map<UUID, String> emails = new HashMap<>();
        for (RefundRequest request : requests) {
            OrderRefundContext context = contexts.get(request.getOrderId());
            if (context != null) {
                emails.putIfAbsent(request.getBuyerIdentityId(), context.buyerEmail());
            }
        }
        return emails;
    }

    // ------------------------------------------------------------------- labels

    private static final String REMOVED_PRODUCT = "(product removed)";
    private static final String REMOVED_VARIANT = "(variant removed)";

    /** "2 × Aurora One Wireless Headphones, 1 × Travel Case" - the queue's Items column. */
    private static String itemsLabel(
            List<RefundRequestLine> myLines, OrderRefundContext context, Map<UUID, String> titles) {
        return myLines.stream()
                .map(line -> line.getQuantity() + " × " + titleOf(line, context, titles))
                .collect(Collectors.joining(", "));
    }

    private static String productTitles(
            List<RefundRequestLine> myLines, OrderRefundContext context, Map<UUID, String> titles) {
        return myLines.stream()
                .map(line -> titleOf(line, context, titles))
                .collect(Collectors.joining(" "));
    }

    private static String titleOf(
            RefundRequestLine line, OrderRefundContext context, Map<UUID, String> titles) {
        if (context == null) {
            return REMOVED_PRODUCT;
        }
        return context.lines().stream()
                .filter(orderLine -> orderLine.orderLineId().equals(line.getOrderLineId()))
                .findFirst()
                .map(orderLine -> titles.getOrDefault(orderLine.productId(), REMOVED_PRODUCT))
                .orElse(REMOVED_PRODUCT);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
