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
import com.arkindustries.amezo.orders.dto.OrderTimelineEntryResponse;
import com.arkindustries.amezo.orders.dto.ShipmentInfoResponse;
import com.arkindustries.amezo.orders.dto.StoreRefResponse;
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
 * WHAT IS MISSING, AND THE ONE THING THAT WOULD FILL IT. Refunds are modelled
 * once, by refund_request, with their own state machine - so nothing here derives,
 * stores or invents refund state, and there is no second refund model in this
 * feature. Several contract fields are consequently empty, and ONE batched query
 * from the refund feature fills all of them:
 *
 *   Map&lt;UUID, List&lt;OrderRefundSnapshot&gt;&gt; refundsByOrderIds(Collection&lt;UUID&gt;)
 *
 * on the refund feature's own `.api` package, where a snapshot carries the
 * request's id, reference, status, resolution, requestedAt, requestedAmount,
 * approvedAmount, currency, whether its status counts as OPEN, and the order line
 * ids it covers. With that in hand:
 *
 *  - BuyerOrderSummary.openRefundRequestId / openRefundStatus - the request
 *    currently attached to the order (toSummary);
 *  - BuyerOrderLine.refundRequestId / refundStatus - per line, the open one
 *    (toLineResponse);
 *  - BuyerOrderDetail.refundRequests - the list, a field BuyerOrderDetailResponse
 *    does not declare because declaring it means declaring RefundStatus here;
 *  - status REFUNDED - derived when a request reaches REFUNDED, never stored
 *    (statusOf);
 *  - the Refunds tab - the hasOpenRefund argument BuyerOrderGroup already takes;
 *  - canRequestRefund - the "and no open request" half it is missing.
 *
 * Each is a single call site in this class. Nothing is stubbed to look finished:
 * the Refunds tab honestly counts zero because this database holds no refund rows,
 * not because a zero is hard-coded into the response.
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

    public BuyerOrderService(
            OrderRepository orderRepository,
            OrderLineRepository orderLineRepository,
            CurrentBuyer currentBuyer,
            ProductCatalogSummaryQuery productCatalogSummaryQuery,
            ProductVariantSummaryQuery productVariantSummaryQuery,
            SellerStoreRefQuery sellerStoreRefQuery) {
        this.orderRepository = orderRepository;
        this.orderLineRepository = orderLineRepository;
        this.currentBuyer = currentBuyer;
        this.productCatalogSummaryQuery = productCatalogSummaryQuery;
        this.productVariantSummaryQuery = productVariantSummaryQuery;
        this.sellerStoreRefQuery = sellerStoreRefQuery;
    }

    @Transactional(readOnly = true)
    public BuyerOrderSummaryPageResponse listMine(
            OrderStatus status, BuyerOrderGroup group, String q, LocalDate from, LocalDate to, int page, int size) {

        List<BuyerOrderSummaryResponse> matching = candidatesFor(from, to).stream()
                .filter(candidate -> status == null || candidate.summary().status() == status)
                .filter(candidate -> group.contains(candidate.summary().status(), candidate.hasOpenRefund()))
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
    public FacetListResponse facetsForMine(String q, BuyerOrderPeriod period) {
        List<Candidate> inWindow = candidatesFor(period.startDate(), null).stream()
                .filter(candidate -> candidate.matches(q))
                .toList();

        return new FacetListResponse(BuyerOrderGroup.tabs().stream()
                .map(group -> FacetResponse.counted(
                        group.wireValue(),
                        inWindow.stream()
                                .filter(candidate ->
                                        group.contains(candidate.summary().status(), candidate.hasOpenRefund()))
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
        List<BuyerOrderLineResponse> lineResponses = lines.stream()
                .map(line -> toLineResponse(line, catalog))
                .toList();

        BigDecimal subtotal = sumOf(lineResponses);

        return new BuyerOrderDetailResponse(
                order.getId(),
                OrderReferences.of(order.getId()),
                order.getPlacedAt(),
                statusOf(order),
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
                // The half of the contract's rule this backend can answer. The
                // other half - "and there is no open refund request" - needs the
                // refund query named in the class doc comment. Until then this
                // over-permits, and POST /api/v1/refund-requests stays the thing
                // that actually refuses a duplicate: a UI hint that is too
                // generous is recoverable, one that hides the button from someone
                // entitled to press it is not.
                statusOf(order) == OrderStatus.DELIVERED,
                // No return window is defined anywhere - no column, no policy
                // table, no configured duration. A date computed from a duration
                // this code invented would be a deadline the marketplace never
                // agreed to, printed on the buyer's screen as though it had.
                null);
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
    private record Candidate(BuyerOrderSummaryResponse summary, List<BuyerOrderLineResponse> allLines) {

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

        /**
         * Always false today: this database holds no refund rows to open. The one
         * place the refund query named in the class doc comment gets wired in, so
         * that it is one edit rather than a scatter of `false` literals.
         */
        boolean hasOpenRefund() {
            return summary.openRefundRequestId() != null;
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

        return orders.stream()
                .map(order -> toCandidate(
                        order, sortedLines(linesByOrderId.getOrDefault(order.getId(), List.of())), catalog))
                .toList();
    }

    private Candidate toCandidate(Order order, List<OrderLine> lines, Catalog catalog) {
        List<BuyerOrderLineResponse> lineResponses = lines.stream()
                .map(line -> toLineResponse(line, catalog))
                .toList();

        BuyerOrderSummaryResponse summary = new BuyerOrderSummaryResponse(
                order.getId(),
                OrderReferences.of(order.getId()),
                order.getPlacedAt(),
                statusOf(order),
                sumOf(lineResponses),
                CURRENCY,
                // Items, not lines: two of one shirt is two items on one line, and
                // "1 item" on a card holding a pair of them reads as a bug.
                lineResponses.stream().mapToInt(BuyerOrderLineResponse::quantity).sum(),
                storeRefFor(lines, catalog),
                lineResponses.stream().limit(PREVIEW_LINES).toList(),
                shipmentFor(order),
                // See the class doc comment: refund state has one owner, and it is
                // not this feature.
                null,
                null);

        return new Candidate(summary, lineResponses);
    }

    // ---------------------------------------------------------------------
    // Field-by-field mapping.
    // ---------------------------------------------------------------------

    /**
     * The order's status as a buyer sees it.
     *
     * A method rather than a getter call because REFUNDED is DERIVED, never
     * declared: the contract's OrderStatus says so, and the day the refund feature
     * exposes its state this is the one expression that has to learn "a settled
     * refund request makes this order REFUNDED". Today it is the stored value,
     * which is the honest answer while no refund can exist.
     */
    private static OrderStatus statusOf(Order order) {
        return order.getStatus();
    }

    private BuyerOrderLineResponse toLineResponse(OrderLine line, Catalog catalog) {
        ProductCatalogSummary product = catalog.products().get(line.getProductIdSnapshot());
        BigDecimal lineTotal = line.getUnitPriceSnapshot().multiply(BigDecimal.valueOf(line.getQuantity()));

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
                null,
                null);
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
     * Three stages, not the contract's six. PACKED, IN_TRANSIT and OUT_FOR_DELIVERY
     * are codes its vocabulary has and this schema cannot express: OrderStatus has
     * no such values and no column records when any of them happened. Emitting them
     * anyway would draw three steps that are permanently incomplete on a delivered
     * order - a progress bar asserting the order was never packed.
     *
     * DELIVERED carries a null `at` even when complete: orders has placed_at and
     * shipped_at and no delivered_at. A date inferred from the status alone would be
     * a timestamp this system does not have, printed as though it did.
     *
     * `estimated` is false throughout - nothing here projects a future date, and
     * ShipmentInfo.estimatedDeliveryAt is null for the same reason.
     */
    private static List<OrderTimelineEntryResponse> timelineFor(Order order) {
        OrderStatus status = statusOf(order);
        boolean shipped = status == OrderStatus.SHIPPED || status == OrderStatus.DELIVERED;

        return List.of(
                new OrderTimelineEntryResponse(
                        OrderStatus.PLACED.name(), "Order placed", order.getPlacedAt(), false, true, null),
                new OrderTimelineEntryResponse(
                        OrderStatus.SHIPPED.name(), "Shipped", order.getShippedAt(), false, shipped, null),
                new OrderTimelineEntryResponse(
                        OrderStatus.DELIVERED.name(), "Delivered", null, false, status == OrderStatus.DELIVERED, null));
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
                null, order.getTrackingNumber(), null, order.getShippedAt(), null, null, null);
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
