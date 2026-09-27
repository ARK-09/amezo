package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.api.ProductCatalogSummary;
import com.arkindustries.amezo.catalog.api.ProductCatalogSummaryQuery;
import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.identity.api.CurrentBuyer;
import com.arkindustries.amezo.identity.api.SellerStoreRefQuery;
import com.arkindustries.amezo.identity.api.StoreRef;
import com.arkindustries.amezo.orders.dto.AddressResponse;
import com.arkindustries.amezo.orders.dto.BuyerOrderDetailResponse;
import com.arkindustries.amezo.orders.dto.BuyerOrderLineResponse;
import com.arkindustries.amezo.orders.dto.BuyerOrderSummaryPageResponse;
import com.arkindustries.amezo.orders.dto.BuyerOrderSummaryResponse;
import com.arkindustries.amezo.orders.dto.FacetListResponse;
import com.arkindustries.amezo.orders.dto.FacetResponse;
import com.arkindustries.amezo.orders.dto.OrderRefundSummaryResponse;
import com.arkindustries.amezo.orders.dto.OrderTimelineEntryResponse;
import com.arkindustries.amezo.orders.dto.ShipmentInfoResponse;
import com.arkindustries.amezo.orders.dto.StoreRefResponse;
import com.arkindustries.amezo.refunds.api.OrderRefundQuery;
import com.arkindustries.amezo.refunds.api.OrderRefundSnapshot;
import com.arkindustries.amezo.refunds.api.RefundWindowPolicy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The buyer's own order history: GET /api/v1/orders, its facet counts, and one
 * order's detail.
 *
 * OWNERSHIP is orders.buyer_identity_id, and nothing else. It is NOT NULL and
 * checkout always sets it - unlike orders.seller_id, which V12 relaxed to
 * nullable and checkout stopped writing (see Order's doc comment). That column is
 * why the seller side has to scope per line, and why this side must not copy that
 * shape. Neither list method takes a buyer id: the subject is whoever the session
 * cookie names, so cross-buyer isolation is a property of the query rather than of
 * a check somebody could forget. An id belonging to another buyer 404s, matching
 * the products / images / seller-orders convention - a 403 would confirm the order
 * exists to someone with no business knowing it does.
 *
 * WHERE EACH FILTER RUNS. The date window is SQL (OrderRepository
 * .findForBuyerInWindow). `group`, `status` and `q` are applied afterwards, in
 * Java, and that is a boundary decision rather than laziness:
 *
 *  - `q` matches product titles, and products live in catalog. This feature may
 *    not join to catalog's tables at all - PackageBoundaryTest fails the build for
 *    it - only ask catalog.api for the titles, which means the titles arrive after
 *    the rows do.
 *  - `group` spans OrderStatus values the Java enum does not have yet, and its
 *    Refunds bucket reads a refund_request table that does not exist.
 *
 * So one request loads the buyer's window, resolves every line, title, variant and
 * storefront in a fixed number of batched queries, then filters, sorts and pages
 * that. The cost is bounded by ONE BUYER'S HISTORY, not by the marketplace's -
 * which is what makes it a different judgement call from the seller's order list,
 * where the same shape would eventually load a shop's lifetime of sales. Said
 * plainly so that the day a buyer with ten thousand orders exists, this paragraph
 * is where the fix starts.
 *
 * REFUND STATE COMES FROM REFUNDS, AND IS NEVER STORED HERE. Refunds are modelled
 * once, by refund_request, with their own state machine, so this feature reads them
 * through {@code refunds.api.OrderRefundQuery} and writes nothing. One batched call
 * per request ({@code refundsByOrderIds}) answers every refund field the contract
 * puts on an order:
 *
 *  - status REFUNDED - DERIVED from a request settled with money, never stored
 *    (statusOf). A REPLACEMENT_SENT request is settled but moved a parcel rather
 *    than money, and leaves the fulfilment status alone;
 *  - BuyerOrderSummary.openRefundRequestId / openRefundStatus - the LATEST request
 *    against the order, settled ones included, because that is what the card's badge
 *    reports;
 *  - BuyerOrderLine.refundRequestId / refundStatus - per line, the request still
 *    OPEN over it, which is what the contract says those two mean;
 *  - BuyerOrderDetail.refundRequests - every request, oldest first;
 *  - the Refunds tab - any request at all, so a refund does not leave the tab at the
 *    moment it is paid out (see BuyerOrderGroup);
 *  - canRequestRefund / refundWindowEndsAt - {@code refunds.api.RefundWindowPolicy}
 *    plus the units still unclaimed, which is the rule POST /api/v1/refund-requests
 *    actually enforces.
 *
 * THIS IS THE SAME SOURCE THE SELLER SIDE READS. SellerOrderRowService derives its
 * REFUNDED the same way from the same query, which is what makes "the seller settled
 * it" and "the buyer can see it was settled" one fact rather than two that drift.
 */
@Service
public class BuyerOrderService {

    /**
     * No price column in this schema carries a currency - offers, order lines and
     * order totals are all bare NUMERIC(10,2) - and the frontend's formatPrice() is
     * fixed to USD to match. A constant for the same reason SellerMetricsService
     * states it as one: the day money becomes multi-currency, there should be
     * exactly one place per feature that is wrong.
     */
    private static final String CURRENCY = "USD";

    /**
     * Postage and tax. Zero rather than null because the contract requires both as
     * numbers, and zero is the true total of what this marketplace adds on top of
     * the line prices - there is no rate table, no nexus and no carrier price
     * anywhere in the schema. See BuyerOrderDetailResponse.
     */
    private static final BigDecimal NOT_CHARGED = BigDecimal.ZERO;

    /** How many lines a collapsed card shows before it is expanded. */
    private static final int PREVIEW_LINES = 2;

    private static final String PRODUCT_REMOVED = "(product removed)";
    private static final String VARIANT_REMOVED = "(variant removed)";

    private final OrderRepository orderRepository;
    private final OrderLineRepository orderLineRepository;
    private final CurrentBuyer currentBuyer;
    private final ProductCatalogSummaryQuery productCatalogSummaryQuery;
    private final ProductVariantSummaryQuery productVariantSummaryQuery;
    private final SellerStoreRefQuery sellerStoreRefQuery;
    private final OrderRefundQuery orderRefundQuery;
    private final RefundWindowPolicy refundWindow;

    public BuyerOrderService(
            OrderRepository orderRepository,
            OrderLineRepository orderLineRepository,
            CurrentBuyer currentBuyer,
            ProductCatalogSummaryQuery productCatalogSummaryQuery,
            ProductVariantSummaryQuery productVariantSummaryQuery,
            SellerStoreRefQuery sellerStoreRefQuery,
            OrderRefundQuery orderRefundQuery,
            RefundWindowPolicy refundWindow) {
        this.orderRepository = orderRepository;
        this.orderLineRepository = orderLineRepository;
        this.currentBuyer = currentBuyer;
        this.productCatalogSummaryQuery = productCatalogSummaryQuery;
        this.productVariantSummaryQuery = productVariantSummaryQuery;
        this.sellerStoreRefQuery = sellerStoreRefQuery;
        this.orderRefundQuery = orderRefundQuery;
        this.refundWindow = refundWindow;
    }

    @Transactional(readOnly = true)
    public BuyerOrderSummaryPageResponse listMine(
            OrderStatus status, BuyerOrderGroup group, String q, LocalDate from, LocalDate to, int page, int size) {

        List<BuyerOrderSummaryResponse> matching = candidatesFor(from, to).stream()
                // ?status= is a FULFILMENT status, so it is compared by name against the
                // derived one. An order refunded after delivery no longer matches
                // status=DELIVERED, which is the same answer the seller's list gives:
                // REFUNDED is what that order is now.
                .filter(candidate -> status == null || status.name().equals(candidate.summary().status()))
                .filter(candidate -> group.contains(candidate.summary().status(), candidate.hasRefundRequest()))
                .filter(candidate -> candidate.matches(q))
                .map(Candidate::summary)
                .toList();

        // A page past the end is clamped to an empty slice rather than refused:
        // ?page=9 is a stale bookmark or a filter that just narrowed under the
        // buyer's feet, and totalPages is what tells them where the list now ends.
        int totalPages = Math.max(1, (int) Math.ceil((double) matching.size() / size));
        int start = Math.min(page * size, matching.size());
        int end = Math.min(start + size, matching.size());

        return new BuyerOrderSummaryPageResponse(
                matching.subList(start, end), page, matching.size(), totalPages);
    }

    /**
     * The count on every tab, for the window and the search the list is showing.
     *
     * Deliberately NOT narrowed by the selected tab, and this is the whole reason
     * it is a second endpoint rather than a field on the list: a group-filtered
     * count reports zero for every bucket except the one already open, which is the
     * tab strip telling the buyer they have no delivered orders while they stand in
     * the in-progress ones.
     *
     * It shares candidatesFor with the list on purpose. A count computed by a
     * second, similar-looking pipeline is a count that eventually disagrees with
     * the list its tab opens.
     */
    @Transactional(readOnly = true)
    public FacetListResponse facetsForMine(String q, LocalDate from, LocalDate to) {
        // The same window helper the list uses, so a tab's count and the list it
        // opens are computed from one date range rather than two vocabularies
        // that can disagree about what "past 3 months" means.
        List<Candidate> inWindow = candidatesFor(from, to).stream()
                .filter(candidate -> candidate.matches(q))
                .toList();

        return new FacetListResponse(BuyerOrderGroup.tabs().stream()
                .map(group -> FacetResponse.counted(
                        group.wireValue(),
                        inWindow.stream()
                                .filter(candidate ->
                                        group.contains(candidate.summary().status(), candidate.hasRefundRequest()))
                                .count()))
                .toList());
    }

    @Transactional(readOnly = true)
    public BuyerOrderDetailResponse getMine(UUID orderId) {
        UUID buyerIdentityId = currentBuyer.buyerIdentityId();

        // findById then compare, rather than a derived findByIdAndBuyerIdentityId:
        // both answers are the same 404, and one filter that can be read at a
        // glance beats a method name whose safety depends on noticing its second
        // argument is still there.
        Order order = orderRepository.findById(orderId)
                .filter(candidate -> candidate.getBuyerIdentityId().equals(buyerIdentityId))
                .orElseThrow(() -> new NotFoundException("Order " + orderId + " not found"));

        List<OrderLine> lines = sortedLines(orderLineRepository.findByOrderId(order.getId()));
        Catalog catalog = catalogFor(lines);
        List<OrderRefundSnapshot> refunds = orderRefundQuery.refundsForOrder(order.getId());
        List<BuyerOrderLineResponse> lineResponses = lines.stream()
                .map(line -> toLineResponse(line, catalog, refunds))
                .toList();

        BigDecimal subtotal = sumOf(lineResponses);

        return new BuyerOrderDetailResponse(
                order.getId(),
                OrderReferences.of(order.getId()),
                order.getPlacedAt(),
                statusOf(order, refunds),
                storeRefFor(lines, catalog),
                lineResponses,
                subtotal,
                NOT_CHARGED,
                NOT_CHARGED,
                subtotal,
                CURRENCY,
                timelineFor(order),
                shipmentFor(order),
                toAddressResponse(order.getShippingAddress()),
                // Only when it is genuinely a different address: the billing
                // columns are NOT NULL and hold a copy of shipping whenever
                // billing_same_as_shipping is set. See BuyerOrderDetailResponse.
                order.isBillingSameAsShipping() ? null : toAddressResponse(order.getBillingAddress()),
                refundSummaries(order, refunds),
                canRequestRefund(order, lines),
                // The real window, from the one class that owns its length. The order
                // detail publishes it and POST /api/v1/refund-requests refuses a late
                // request by it, so the date the buyer is shown is the date they are
                // actually held to.
                refundWindow.endsAt(order.getPlacedAt()));
    }

    /**
     * Whether the buyer may still raise a request against this order.
     *
     * Server-owned, as the contract requires, and computed from the three things
     * POST /api/v1/refund-requests actually checks, so the button and the endpoint
     * cannot disagree:
     *
     *  - the goods arrived. Read from the STORED status, deliberately not the derived
     *    one: a PARTIAL refund derives the whole order to REFUNDED, and testing that
     *    would hide the button from a buyer entitled to ask about the items they kept.
     *    A UI hint that is too generous is recoverable; one that hides the button from
     *    someone entitled to press it is not.
     *  - the return window is open;
     *  - something is still returnable. A line is spoken for when its whole quantity
     *    has been claimed by requests that were not released - which is the exact rule
     *    POST enforces, rather than the coarser "no open request anywhere on the order"
     *    that would refuse a second request about a different item.
     */
    private boolean canRequestRefund(Order order, List<OrderLine> lines) {
        if (order.getStatus() != OrderStatus.DELIVERED) {
            return false;
        }
        if (!refundWindow.isOpenAt(order.getPlacedAt(), Instant.now())) {
            return false;
        }
        List<UUID> lineIds = lines.stream().map(OrderLine::getId).toList();
        Set<UUID> locked = orderRefundQuery.orderLineIdsUnderOpenRequest(lineIds);
        Map<UUID, Integer> claimed = orderRefundQuery.claimedQuantityByOrderLineId(lineIds);
        return lines.stream().anyMatch(line -> !locked.contains(line.getId())
                && line.getQuantity() - claimed.getOrDefault(line.getId(), 0) > 0);
    }

    /**
     * Every request against the order, oldest first, in the shape the seller's own
     * order detail publishes - so the two sides of a refund describe it identically.
     *
     * buyerName and buyerEmail stay null: this is the buyer's own order and they are
     * the buyer. {@code items} likewise - the card names the products from the order's
     * own lines, and the seller's queue is what needs a one-line summary of them.
     */
    private static List<OrderRefundSummaryResponse> refundSummaries(
            Order order, List<OrderRefundSnapshot> refunds) {

        String orderReference = OrderReferences.of(order.getId());
        return refunds.stream()
                .map(refund -> new OrderRefundSummaryResponse(
                        refund.id(),
                        refund.reference(),
                        refund.status(),
                        refund.resolution(),
                        refund.requestedAt(),
                        refund.requestedAmount(),
                        refund.approvedAmount(),
                        refund.currency(),
                        order.getId(),
                        orderReference,
                        refund.returnTrackingNumber(),
                        null,
                        null,
                        null))
                .toList();
    }

    // ---------------------------------------------------------------------
    // The one pipeline the list and its facets share.
    // ---------------------------------------------------------------------

    /**
     * An order resolved far enough to be filtered, counted and paged.
     *
     * It carries EVERY line, while the summary inside it carries only the two a
     * collapsed card prints. Search has to see all of them - a card is found by any
     * product in the order, not only by the two that happen to show - and this is
     * how it does that without a second query per card, and without the request
     * state on a shared singleton that the alternative needs.
     */
    private record Candidate(
            BuyerOrderSummaryResponse summary,
            List<BuyerOrderLineResponse> allLines,
            boolean hasRefundRequest) {

        /**
         * Search, over the fields the contract names: "order reference and product
         * titles".
         *
         * The titles are the catalog's as it reads today, which is the same text
         * the card prints - so a buyer searching for what is on their screen finds
         * it. Matching a purchase-time snapshot instead would make a product
         * renamed since then findable only by a name the buyer can no longer see.
         */
        boolean matches(String q) {
            if (q == null || q.isBlank()) {
                return true;
            }
            String term = q.trim().toLowerCase(Locale.ROOT);
            return OrderReferences.matches(summary.id(), term)
                    || allLines.stream()
                            .anyMatch(line -> line.productTitle().toLowerCase(Locale.ROOT).contains(term));
        }

    }

    /**
     * Every order of the current buyer's inside the window, fully resolved, newest
     * first.
     *
     * A fixed number of queries whatever the row count: one for the orders, one for
     * all of their lines, then one batch each for product summaries, variant labels
     * and storefronts. Never one per order, never one per line.
     */
    private List<Candidate> candidatesFor(LocalDate from, LocalDate to) {
        UUID buyerIdentityId = currentBuyer.buyerIdentityId();

        List<Order> orders = orderRepository.findForBuyerInWindow(
                buyerIdentityId, startOfDay(from), startOfDayAfter(to));
        if (orders.isEmpty()) {
            return List.of();
        }

        Map<UUID, List<OrderLine>> linesByOrderId =
                orderLineRepository.findByOrderIdIn(orders.stream().map(Order::getId).toList()).stream()
                        .collect(Collectors.groupingBy(OrderLine::getOrderId));

        Catalog catalog = catalogFor(
                linesByOrderId.values().stream().flatMap(List::stream).toList());

        // One query for every order's refunds, not one per card. Absent from the map
        // means no request was ever raised against that order.
        Map<UUID, List<OrderRefundSnapshot>> refundsByOrderId =
                orderRefundQuery.refundsByOrderIds(orders.stream().map(Order::getId).toList());

        return orders.stream()
                .map(order -> toCandidate(
                        order,
                        sortedLines(linesByOrderId.getOrDefault(order.getId(), List.of())),
                        catalog,
                        refundsByOrderId.getOrDefault(order.getId(), List.of())))
                .toList();
    }

    private Candidate toCandidate(
            Order order, List<OrderLine> lines, Catalog catalog, List<OrderRefundSnapshot> refunds) {

        List<BuyerOrderLineResponse> lineResponses = lines.stream()
                .map(line -> toLineResponse(line, catalog, refunds))
                .toList();

        // The latest request, whatever became of it. The card badges this one, and a
        // declined request still has to say so - "a refund that has been approved or
        // declined does not read the same as one nobody has looked at yet". Whether it
        // is still running is the status' answer, which the screen reads itself.
        OrderRefundSnapshot latestRefund = refunds.isEmpty() ? null : refunds.get(refunds.size() - 1);

        BuyerOrderSummaryResponse summary = new BuyerOrderSummaryResponse(
                order.getId(),
                OrderReferences.of(order.getId()),
                order.getPlacedAt(),
                statusOf(order, refunds),
                sumOf(lineResponses),
                CURRENCY,
                // Items, not lines: two of one shirt is two items on one line, and
                // "1 item" on a card holding a pair of them reads as a bug.
                lineResponses.stream().mapToInt(BuyerOrderLineResponse::quantity).sum(),
                storeRefFor(lines, catalog),
                lineResponses.stream().limit(PREVIEW_LINES).toList(),
                shipmentFor(order),
                latestRefund == null ? null : latestRefund.id(),
                latestRefund == null ? null : latestRefund.status());

        return new Candidate(summary, lineResponses, !refunds.isEmpty());
    }

    // ---------------------------------------------------------------------
    // Field-by-field mapping.
    // ---------------------------------------------------------------------

    /**
     * The order's status as a buyer sees it.
     *
     * REFUNDED is DERIVED, never stored: the refund request is the single source of
     * that fact, so there is no order column a client could also set and nothing to
     * reconcile when a seller settles a refund from their queue rather than from the
     * order. SellerOrderRowService derives it from the same query, which is what makes
     * both sides agree about the same order.
     *
     * A REPLACEMENT_SENT request is settled but is deliberately NOT refunded - it moved
     * a parcel, not money - which is why this reads the snapshot's own
     * {@code refunded()} rather than testing for a terminal status.
     */
    private static String statusOf(Order order, List<OrderRefundSnapshot> refunds) {
        boolean refunded = refunds.stream().anyMatch(OrderRefundSnapshot::refunded);
        return refunded ? OrderStatus.DERIVED_REFUNDED : order.getStatus().name();
    }

    /**
     * The request covering this line, if one is still OPEN over it.
     *
     * Open only, because that is exactly what the contract says the line's two refund
     * fields mean: "set when this line is inside an open refund request". A settled one
     * leaves the line unmarked here and is still findable - the requests' own line
     * lists say which lines the money went back on, which is what the buyer's card
     * reads to keep tagging them.
     *
     * The newest open one wins where an order's lines were split across two requests;
     * per line there can only be one, since V21's partial unique index refuses a second.
     */
    private static OrderRefundSnapshot openRefundOver(UUID orderLineId, List<OrderRefundSnapshot> refunds) {
        OrderRefundSnapshot found = null;
        for (OrderRefundSnapshot refund : refunds) {
            if (refund.open() && refund.orderLineIds().contains(orderLineId)) {
                found = refund;
            }
        }
        return found;
    }

    private BuyerOrderLineResponse toLineResponse(
            OrderLine line, Catalog catalog, List<OrderRefundSnapshot> refunds) {

        ProductCatalogSummary product = catalog.products().get(line.getProductIdSnapshot());
        BigDecimal lineTotal = line.getUnitPriceSnapshot().multiply(BigDecimal.valueOf(line.getQuantity()));
        OrderRefundSnapshot openRefund = openRefundOver(line.getId(), refunds);

        return new BuyerOrderLineResponse(
                line.getId(),
                // The slug a product link is built from. Null when the product is
                // gone for good: a link to nothing is worse than no link, and the
                // screen can tell the two apart.
                product == null ? null : product.reference(),
                product == null ? PRODUCT_REMOVED : product.title(),
                catalog.variantLabels().getOrDefault(line.getVariantIdSnapshot(), VARIANT_REMOVED),
                product == null ? null : product.thumbnailUrl(),
                line.getQuantity(),
                line.getUnitPriceSnapshot(),
                lineTotal,
                openRefund == null ? null : openRefund.id(),
                openRefund == null ? null : openRefund.status());
    }

    /**
     * The storefront the card names.
     *
     * THIS IS WHERE THE CONTRACT AND THE SCHEMA DISAGREE, and it is flagged rather
     * than papered over. BuyerOrderSummary.seller is a single required StoreRef and
     * the endpoint's own description promises "one entry per seller order, so a
     * checkout that split across two sellers shows two rows" - but checkout creates
     * ONE orders row per call however many sellers its lines belong to, and
     * BuyerOrderSummary.id is the uuid GET /api/v1/orders/{orderId} is keyed by, so
     * two rows for one order cannot both be addressable. Splitting would also break
     * POST /api/v1/refund-requests, which raises a request against an orderId.
     *
     * So: one row per real order, and for a mixed-seller order the seller of its
     * FIRST line - deterministic (lines are sorted by created_at then id), never
     * arbitrary, and exactly right for every order a single seller fulfilled, which
     * is all of them that exist today.
     *
     * Null only when every one of the order's sellers has been deleted outright.
     * StoreRef is required in the contract, so this is a hole - but a 500 on a
     * buyer's whole order history because one shop closed is worse than one card
     * with no shop name on it.
     */
    private StoreRefResponse storeRefFor(List<OrderLine> lines, Catalog catalog) {
        return lines.stream()
                .map(OrderLine::getSellerIdSnapshot)
                .map(catalog.stores()::get)
                .filter(Objects::nonNull)
                .findFirst()
                .map(ref -> new StoreRefResponse(ref.id(), ref.name(), ref.handle()))
                .orElse(null);
    }

    /**
     * The delivery progress bar.
     *
     * Four stages, not the contract's six. PACKED joined them with V24, which gave it
     * a status and a packed_at to print; DELIVERED got its own timestamp with V26.
     * IN_TRANSIT and OUT_FOR_DELIVERY are still left out: they are carrier codes
     * nothing in this system can report, and drawing two steps that are permanently
     * incomplete on a delivered order is a progress bar telling the buyer their parcel
     * never travelled.
     *
     * Completeness is read from the timestamps where there is one, not from the
     * status alone: an order marked delivered by a seller who never recorded the
     * handover is still packed and still shipped, and a bar that unticked those would
     * be arguing with itself.
     *
     * A stage with no timestamp keeps a null `at` rather than borrowing a neighbour's:
     * an order that reached DELIVERED before V26 existed has no date, and printing one
     * would be a fabrication with a timestamp on it.
     *
     * `estimated` is false throughout - nothing here projects a future date, and
     * ShipmentInfo.estimatedDeliveryAt is null for the same reason.
     *
     * The STORED status, not the derived one. A refund does not un-deliver a parcel:
     * the buyer had the thing, and a delivery bar that untickled itself when the money
     * came back would be describing a journey that did not happen.
     */
    private static List<OrderTimelineEntryResponse> timelineFor(Order order) {
        OrderStatus status = order.getStatus();
        boolean packed = order.getPackedAt() != null
                || status == OrderStatus.PACKED
                || status == OrderStatus.SHIPPED
                || status == OrderStatus.DELIVERED;
        boolean shipped = status == OrderStatus.SHIPPED || status == OrderStatus.DELIVERED;

        return List.of(
                new OrderTimelineEntryResponse(
                        OrderStatus.PLACED.name(), "Order placed", order.getPlacedAt(), false, true, null),
                new OrderTimelineEntryResponse(
                        OrderStatus.PACKED.name(), "Packed", order.getPackedAt(), false, packed, null),
                new OrderTimelineEntryResponse(
                        OrderStatus.SHIPPED.name(), "Shipped", order.getShippedAt(), false, shipped, null),
                new OrderTimelineEntryResponse(
                        OrderStatus.DELIVERED.name(), "Delivered", order.getDeliveredAt(), false,
                        status == OrderStatus.DELIVERED, null));
    }

    /**
     * Null when nothing is known, so a screen reading `shipment?.trackingNumber`
     * prints nothing rather than a tracking panel with six blank rows in it.
     */
    private static ShipmentInfoResponse shipmentFor(Order order) {
        if (order.getTrackingNumber() == null && order.getShippedAt() == null) {
            return null;
        }
        return new ShipmentInfoResponse(
                null, order.getTrackingNumber(), null, order.getShippedAt(), null,
                order.getDeliveredAt(), null);
    }

    private static AddressResponse toAddressResponse(Address address) {
        if (address == null) {
            return null;
        }
        return new AddressResponse(
                address.getFullName(),
                address.getLine1(),
                address.getLine2(),
                address.getCity(),
                address.getState(),
                address.getPostalCode(),
                address.getCountry());
    }

    // ---------------------------------------------------------------------
    // Shared helpers.
    // ---------------------------------------------------------------------

    /** Every cross-feature lookup one request needs, resolved once up front. */
    private record Catalog(
            Map<UUID, ProductCatalogSummary> products,
            Map<UUID, String> variantLabels,
            Map<UUID, StoreRef> stores) {
    }

    private Catalog catalogFor(Collection<OrderLine> lines) {
        return new Catalog(
                productCatalogSummaryQuery.summariesByIds(
                        lines.stream().map(OrderLine::getProductIdSnapshot).collect(Collectors.toSet())),
                productVariantSummaryQuery.variantLabelsByIds(
                        lines.stream().map(OrderLine::getVariantIdSnapshot).collect(Collectors.toSet())),
                sellerStoreRefQuery.storeRefsBySellerIds(
                        lines.stream().map(OrderLine::getSellerIdSnapshot).collect(Collectors.toSet())));
    }

    /**
     * Purchase order, stably. created_at is when the line was written and ties are
     * broken by id, so "the first line" means the same thing on every request -
     * which matters, because storeRefFor picks the storefront off it.
     */
    private static List<OrderLine> sortedLines(List<OrderLine> lines) {
        return lines.stream()
                .sorted(Comparator.comparing(OrderLine::getCreatedAt).thenComparing(OrderLine::getId))
                .toList();
    }

    private static BigDecimal sumOf(List<BuyerOrderLineResponse> lines) {
        return lines.stream()
                .map(BuyerOrderLineResponse::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Inclusive lower bound: the first instant of that UTC day. */
    private static Instant startOfDay(LocalDate date) {
        return date == null ? null : date.atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    /**
     * Exclusive upper bound: the first instant of the day AFTER `to`, so that
     * from=to=today returns today's orders rather than nothing. See
     * OrderRepository.findForBuyerInWindow.
     */
    private static Instant startOfDayAfter(LocalDate date) {
        return date == null ? null : date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }
}
