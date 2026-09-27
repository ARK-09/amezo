package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.api.OfferStockService;
import com.arkindustries.amezo.catalog.api.ProductCatalogSummary;
import com.arkindustries.amezo.catalog.api.ProductCatalogSummaryQuery;
import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.identity.api.CurrentSeller;
import com.arkindustries.amezo.orders.dto.AddressResponse;
import com.arkindustries.amezo.orders.dto.FacetListResponse;
import com.arkindustries.amezo.orders.dto.FacetResponse;
import com.arkindustries.amezo.orders.dto.OrderRefundSummaryResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderLineResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderRowDetailResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderRowPageResponse;
import com.arkindustries.amezo.orders.dto.SellerOrderRowResponse;
import com.arkindustries.amezo.orders.dto.ShipmentInfoResponse;
import com.arkindustries.amezo.orders.dto.UpdateSellerOrderRequest;
import com.arkindustries.amezo.refunds.api.OrderRefundQuery;
import com.arkindustries.amezo.refunds.api.OrderRefundSnapshot;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The Seller Orders screen's backend - GET /api/v1/sellers/me/orders, its /facets,
 * one order's detail, and the PATCH that advances it.
 *
 * <h2>Why this exists beside SellerOrderService</h2>
 *
 * The frontend called this whole surface and got 404s: the only seller-order
 * controller served the UNPREFIXED /sellers/me/orders, with a three-field summary,
 * Spring's serialised Page shape, no facets, no search, no groups, no sorting, and
 * a POST /{id}/ship instead of a PATCH. That endpoint is still there and still
 * works; nothing in the frontend calls it any more.
 *
 * <h2>Ownership is per LINE</h2>
 *
 * order_line.seller_id_snapshot, never orders.seller_id, which V12 relaxed to
 * nullable and checkout stopped writing (see Order's doc comment). Every total and
 * every line a seller sees is their own share of the order, so an order carrying two
 * sellers' goods shows each of them their own money. An order this seller has no
 * line on is a 404, not a 403 - a 403 would confirm the order exists to someone with
 * no business knowing it does, matching the products / images convention.
 *
 * <h2>The order-level status gap, inherited and bounded</h2>
 *
 * orders.status is one column for the whole order, so on a multi-seller order one
 * seller marking it PACKED marks it for the other too. That is pre-existing (the old
 * ship() had it) and fixing it means per-line fulfilment state - a schema change well
 * outside this work. It is NOT extended silently: {@link #cancel} refuses outright on
 * a shared order, because cancelling is destructive - it puts stock back and ends the
 * order - and one seller must not be able to do that to another's sale.
 *
 * <h2>Where each filter runs</h2>
 *
 * The seller's queue is loaded once (OrderRepository.findForSeller) and then filtered,
 * sorted and paged in Java. Each reason is recorded on that query. The cost is bounded
 * by one seller's own order history, which is the same judgement call - and the same
 * caveat - as BuyerOrderService.
 */
@Service
public class SellerOrderRowService {

    /**
     * No price column in this schema carries a currency - offers, order lines and
     * order totals are all bare NUMERIC(10,2) - and the frontend's formatPrice() is
     * fixed to USD to match. Stated once here for the same reason BuyerOrderService
     * and SellerMetricsService each state it once: the day money becomes
     * multi-currency there should be exactly one place per feature that is wrong.
     */
    private static final String CURRENCY = "USD";

    /**
     * Postage and tax. Zero rather than null because the contract requires shipping
     * as a number, and zero is the true total of what this marketplace adds on top of
     * the line prices: there is no rate table, no nexus and no carrier price anywhere
     * in the schema.
     */
    private static final BigDecimal NOT_CHARGED = BigDecimal.ZERO;

    private static final String PRODUCT_REMOVED = "(product removed)";
    private static final String VARIANT_REMOVED = "(variant removed)";

    private final OrderRepository orderRepository;
    private final OrderLineRepository orderLineRepository;
    private final OrderEventRepository orderEventRepository;
    private final CurrentSeller currentSeller;
    private final ProductVariantSummaryQuery productVariantSummaryQuery;
    private final ProductCatalogSummaryQuery productCatalogSummaryQuery;
    private final OrderRefundQuery orderRefundQuery;
    private final OfferStockService offerStockService;

    public SellerOrderRowService(
            OrderRepository orderRepository,
            OrderLineRepository orderLineRepository,
            OrderEventRepository orderEventRepository,
            CurrentSeller currentSeller,
            ProductVariantSummaryQuery productVariantSummaryQuery,
            ProductCatalogSummaryQuery productCatalogSummaryQuery,
            OrderRefundQuery orderRefundQuery,
            OfferStockService offerStockService) {
        this.orderRepository = orderRepository;
        this.orderLineRepository = orderLineRepository;
        this.orderEventRepository = orderEventRepository;
        this.currentSeller = currentSeller;
        this.productVariantSummaryQuery = productVariantSummaryQuery;
        this.productCatalogSummaryQuery = productCatalogSummaryQuery;
        this.orderRefundQuery = orderRefundQuery;
        this.offerStockService = offerStockService;
    }

    /**
     * One order in the seller's queue, with everything a row needs already resolved:
     * the seller's own lines, the status as the row reports it (REFUNDED overlaid),
     * and whether a refund is still live.
     *
     * A record rather than four parallel maps so that the list, the sort and the
     * facets are all reading the same computed answer. A tab whose count came from one
     * expression and whose list came from another is how a "3" opens onto two rows.
     */
    private record Candidate(
            Order order,
            List<OrderLine> myLines,
            String status,
            boolean hasOpenRefund,
            BigDecimal myTotal) {
    }

    // ---------------------------------------------------------------- list

    @Transactional(readOnly = true)
    public SellerOrderRowPageResponse listMine(
            UUID productId, String q, String group, OrderStatus status, String sort, int page, int size) {

        SellerOrderGroup bucket = SellerOrderGroup.from(group);
        SellerOrderSort order = SellerOrderSort.from(sort);

        List<Candidate> matching = candidates().stream()
                .filter(candidate -> productId == null || containsProduct(candidate, productId))
                .filter(candidate -> matchesTerm(candidate, q))
                // Both apply when both are given: the tab picks the bucket, ?status=
                // narrows within it. A status the enum cannot hold (REFUNDED arrives as
                // a group, not a status) is not reachable here by construction.
                .filter(candidate -> status == null || status.name().equals(candidate.status()))
                .filter(candidate -> bucket.contains(candidate.status()))
                .sorted(order.comparator())
                .toList();

        // long arithmetic on purpose: ?page=2000000000 with size 100 overflows int to a
        // negative offset, and subList refuses that with an IndexOutOfBoundsException
        // rather than the empty page a request past the end should get.
        int from = (int) Math.min((long) page * size, matching.size());
        int to = (int) Math.min((long) from + size, matching.size());
        List<Candidate> window = matching.subList(from, to);

        return new SellerOrderRowPageResponse(
                window.stream().map(this::toRow).toList(),
                page,
                matching.size(),
                totalPages(matching.size(), size));
    }

    /**
     * Counts for the six tabs.
     *
     * Its own endpoint rather than a field on the list, because the strip shows every
     * bucket at once: counts embedded in a filtered response would zero every tab but
     * the one being viewed. Honours q - the strip describes what the search found -
     * and deliberately ignores group and status, which are what the tabs choose
     * between.
     */
    @Transactional(readOnly = true)
    public FacetListResponse facetsForMine(String q) {
        List<Candidate> searched = candidates().stream()
                .filter(candidate -> matchesTerm(candidate, q))
                .toList();

        return new FacetListResponse(SellerOrderGroup.tabs().stream()
                .map(bucket -> FacetResponse.counted(
                        bucket.wireValue(),
                        searched.stream().filter(candidate -> bucket.contains(candidate.status())).count()))
                .toList());
    }

    // -------------------------------------------------------------- detail

    @Transactional(readOnly = true)
    public SellerOrderRowDetailResponse getDetail(UUID orderId) {
        return toDetail(requireMine(orderId));
    }

    // -------------------------------------------------------------- update

    /**
     * Advances the order along the part of fulfilment the seller performs by hand.
     *
     * Every transition records an {@link OrderEvent}, which is where the fields the
     * order row has nowhere to put - who packed it, which hub it went to, the note -
     * are kept rather than discarded (see V25).
     */
    @Transactional
    public SellerOrderRowDetailResponse update(UUID orderId, UpdateSellerOrderRequest request) {
        Candidate candidate = requireMine(orderId);
        Order order = candidate.order();
        SellerOrderTransition transition = request.status();

        // Against the STORED status, not the derived one: a refunded order's stored
        // status is still whatever fulfilment reached, and the message a seller gets
        // should name the move that was refused rather than the refund.
        transition.checkAllowedFrom(order.getStatus());

        Instant occurredAt = request.occurredAt() != null ? request.occurredAt() : Instant.now();

        switch (transition) {
            case PACKED -> {
                order.setStatus(OrderStatus.PACKED);
                order.setPackedAt(occurredAt);
                // Stored as given, absent included. The contract does not require a
                // parcel count and a 1 invented here would be this server asserting
                // something the seller never said.
                order.setParcels(request.parcels());
            }
            case SHIPPED -> {
                order.setStatus(OrderStatus.SHIPPED);
                order.setShippedAt(occurredAt);
                // Issued by the platform on handover, never accepted from the client.
                order.setTrackingNumber(TrackingNumbers.issue());
                // A seller who ships without recording the packing step still packed
                // it, so the parcel count is taken if they supply it here.
                if (request.parcels() != null) {
                    order.setParcels(request.parcels());
                }
            }
            case CANCELLED -> cancel(candidate, occurredAt);
        }

        orderRepository.save(order);
        orderEventRepository.save(OrderEvent.builder()
                .orderId(order.getId())
                .status(transition.target().name())
                .actorSellerId(currentSeller.sellerId())
                .occurredAt(occurredAt)
                .note(blankToNull(request.note()))
                .parcels(request.parcels())
                .packedBy(blankToNull(request.packedBy()))
                .handoverMethod(request.handoverMethod())
                .hub(blankToNull(request.hub()))
                .build());

        // Re-read rather than patching the response together from the object in hand:
        // the derived status and the refund list come from another feature, and this
        // way the caller is told exactly what a subsequent GET would say.
        return toDetail(requireMine(orderId));
    }

    /**
     * Called off before it went anywhere: the order ends and the reserved stock goes
     * back on the shelf. No money moves, because checkout takes no payment - there is
     * no charge to reverse anywhere in this system.
     *
     * Refused on an order that also carries another seller's lines. orders.status is
     * one column for the whole order, so cancelling it would end their sale too and
     * put back stock they still owe - and unlike a mismarked PACKED, that is not
     * something they can correct afterwards. A per-line cancellation is the real fix
     * and it needs per-line fulfilment state, which this schema does not have.
     */
    private void cancel(Candidate candidate, Instant occurredAt) {
        Order order = candidate.order();
        List<OrderLine> allLines = orderLineRepository.findByOrderId(order.getId());
        boolean sharedWithAnotherSeller = allLines.stream()
                .anyMatch(line -> !line.getSellerIdSnapshot().equals(currentSeller.sellerId()));
        if (sharedWithAnotherSeller) {
            throw new ConflictException(
                    URI.create("https://api/errors/shared-order"),
                    "Cannot cancel a shared order",
                    "Order " + order.getId() + " also contains another seller's items, and cancelling it "
                            + "would end their part of it too. Raise a refund on your own lines instead.",
                    List.of());
        }

        if (!orderRefundQuery.refundsForOrder(order.getId()).isEmpty()) {
            throw new ConflictException(
                    URI.create("https://api/errors/refund-in-progress"),
                    "Refund already raised",
                    "Order " + order.getId() + " has a refund request against it, which is where its "
                            + "money and its return are already being settled.",
                    List.of());
        }

        order.setStatus(OrderStatus.CANCELLED);
        order.setCancelledAt(occurredAt);
        // Unconditional, and per line: the same offer can appear on two lines of one
        // order, and each line's quantity was decremented separately at checkout.
        for (OrderLine line : allLines) {
            offerStockService.restoreStock(line.getOfferId(), line.getQuantity());
        }
    }

    // ------------------------------------------------------------ internals

    /**
     * The seller's whole queue, resolved. One query for the orders, one for their
     * lines, one batched answer from refunds - a fixed number regardless of how many
     * orders come back.
     */
    private List<Candidate> candidates() {
        UUID sellerId = currentSeller.sellerId();
        List<Order> orders = orderRepository.findForSeller(sellerId);
        if (orders.isEmpty()) {
            return List.of();
        }

        List<UUID> orderIds = orders.stream().map(Order::getId).toList();
        Map<UUID, List<OrderLine>> myLinesByOrderId = orderLineRepository.findByOrderIdIn(orderIds).stream()
                .filter(line -> line.getSellerIdSnapshot().equals(sellerId))
                .collect(Collectors.groupingBy(OrderLine::getOrderId));
        Map<UUID, List<OrderRefundSnapshot>> refundsByOrderId = orderRefundQuery.refundsByOrderIds(orderIds);

        return orders.stream().map(order -> toCandidate(order, myLinesByOrderId, refundsByOrderId)).toList();
    }

    private Candidate toCandidate(
            Order order,
            Map<UUID, List<OrderLine>> myLinesByOrderId,
            Map<UUID, List<OrderRefundSnapshot>> refundsByOrderId) {

        List<OrderLine> myLines = myLinesByOrderId.getOrDefault(order.getId(), List.of());
        List<OrderRefundSnapshot> refunds = refundsByOrderId.getOrDefault(order.getId(), List.of());
        return new Candidate(order, myLines, statusOf(order, refunds), hasOpenRefund(refunds), totalOf(myLines));
    }

    /**
     * The status a row reports.
     *
     * REFUNDED is DERIVED, never stored: the refund request is the single source of
     * it, and an order-level column a client could also write would be a second
     * source of truth that nothing reconciles the first time somebody settles a
     * refund from the refund queue instead of from the order. A REPLACEMENT_SENT
     * request is settled but is deliberately NOT refunded - a replacement moves a
     * parcel, not money - which is why this reads the snapshot's own {@code refunded}
     * flag rather than testing for a terminal status.
     */
    private static String statusOf(Order order, List<OrderRefundSnapshot> refunds) {
        boolean refunded = refunds.stream().anyMatch(OrderRefundSnapshot::refunded);
        return refunded ? SellerOrderGroup.REFUNDED_STATUS : order.getStatus().name();
    }

    private static boolean hasOpenRefund(List<OrderRefundSnapshot> refunds) {
        return refunds.stream().anyMatch(OrderRefundSnapshot::open);
    }

    private static BigDecimal totalOf(Collection<OrderLine> lines) {
        return lines.stream()
                .map(line -> line.getUnitPriceSnapshot().multiply(BigDecimal.valueOf(line.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Null, blank and a term nobody typed all mean "no search", not "match nothing". */
    private static boolean matchesTerm(Candidate candidate, String q) {
        if (q == null || q.isBlank()) {
            return true;
        }
        String term = q.trim().toLowerCase(Locale.ROOT);
        Order order = candidate.order();
        String recipient = order.getShippingAddress() == null ? null : order.getShippingAddress().getFullName();
        return OrderReferences.matches(order.getId(), term)
                || contains(order.getBuyerEmailSnapshot(), term)
                || contains(recipient, term);
    }

    private static boolean contains(String value, String lowercaseTerm) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(lowercaseTerm);
    }

    /** This seller's lines only: another seller's line on the same order is not a match. */
    private static boolean containsProduct(Candidate candidate, UUID productId) {
        return candidate.myLines().stream()
                .anyMatch(line -> productId.equals(line.getProductIdSnapshot()));
    }

    /**
     * One page minimum. An empty queue is "page 1 of 1" and not "of 0", so the pager
     * prints a page number that exists and Previous has somewhere to walk back to.
     */
    private static int totalPages(int totalElements, int size) {
        return Math.max(1, (int) Math.ceil((double) totalElements / size));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * Ownership check and row resolution in one, so no caller can read an order
     * without having established that it is this seller's.
     */
    private Candidate requireMine(UUID orderId) {
        UUID sellerId = currentSeller.sellerId();
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("Order " + orderId + " not found"));

        List<OrderLine> myLines = orderLineRepository.findByOrderId(orderId).stream()
                .filter(line -> line.getSellerIdSnapshot().equals(sellerId))
                .toList();
        if (myLines.isEmpty()) {
            // Either it does not exist or none of its lines are this seller's. Both
            // look identical from the outside, on purpose.
            throw new NotFoundException("Order " + orderId + " not found");
        }

        List<OrderRefundSnapshot> refunds = orderRefundQuery.refundsForOrder(orderId);
        return new Candidate(order, myLines, statusOf(order, refunds), hasOpenRefund(refunds), totalOf(myLines));
    }

    // ------------------------------------------------------------- mapping

    private SellerOrderRowResponse toRow(Candidate candidate) {
        Order order = candidate.order();
        return new SellerOrderRowResponse(
                order.getId(),
                OrderReferences.of(order.getId()),
                order.getBuyerEmailSnapshot(),
                recipientOf(order),
                order.getPlacedAt(),
                candidate.status(),
                candidate.myLines().stream().mapToInt(OrderLine::getQuantity).sum(),
                candidate.myTotal(),
                CURRENCY,
                destinationOf(order),
                candidate.hasOpenRefund());
    }

    private SellerOrderRowDetailResponse toDetail(Candidate candidate) {
        Order order = candidate.order();
        List<OrderLine> myLines = candidate.myLines();

        Map<UUID, ProductCatalogSummary> products = productCatalogSummaryQuery.summariesByIds(
                myLines.stream().map(OrderLine::getProductIdSnapshot).toList());
        List<UUID> variantIds = myLines.stream().map(OrderLine::getVariantIdSnapshot).toList();
        Map<UUID, String> variantLabels = productVariantSummaryQuery.variantLabelsByIds(variantIds);
        Map<UUID, String> variantSkus = productVariantSummaryQuery.variantSkusByIds(variantIds);

        List<SellerOrderLineResponse> lines = myLines.stream()
                .map(line -> toLine(line, products, variantLabels, variantSkus))
                .toList();

        BigDecimal subtotal = candidate.myTotal();

        return new SellerOrderRowDetailResponse(
                order.getId(),
                OrderReferences.of(order.getId()),
                order.getBuyerEmailSnapshot(),
                recipientOf(order),
                order.getPlacedAt(),
                candidate.status(),
                lines,
                subtotal,
                NOT_CHARGED,
                NOT_CHARGED,
                // Nothing is added on top, so the total IS the subtotal. Computed as a
                // sum anyway so that the day postage exists, this line is already the
                // place it belongs.
                subtotal.add(NOT_CHARGED).add(NOT_CHARGED),
                CURRENCY,
                toAddress(order),
                shipmentFor(order),
                order.getPackedAt(),
                order.getParcels(),
                refundSummaries(candidate));
    }

    private static SellerOrderLineResponse toLine(
            OrderLine line,
            Map<UUID, ProductCatalogSummary> products,
            Map<UUID, String> variantLabels,
            Map<UUID, String> variantSkus) {

        ProductCatalogSummary product = products.get(line.getProductIdSnapshot());
        return new SellerOrderLineResponse(
                line.getId(),
                // Null when the product is gone for good: a link to nothing is worse
                // than no link, and the screen can tell the two apart.
                product == null ? null : product.reference(),
                product == null ? PRODUCT_REMOVED : product.title(),
                variantLabels.getOrDefault(line.getVariantIdSnapshot(), VARIANT_REMOVED),
                variantSkus.get(line.getVariantIdSnapshot()),
                line.getQuantity(),
                line.getUnitPriceSnapshot(),
                line.getUnitPriceSnapshot().multiply(BigDecimal.valueOf(line.getQuantity())));
    }

    /**
     * The refund requests against this order, as the drawer lists them.
     *
     * The four fields the snapshot cannot carry come from the order itself: its own
     * reference, the buyer, and an items string assembled from the lines the request
     * covers - the product titles live in the catalogue, so a summary row has nothing
     * to build it from on its own.
     */
    private List<OrderRefundSummaryResponse> refundSummaries(Candidate candidate) {
        List<OrderRefundSnapshot> refunds = orderRefundQuery.refundsForOrder(candidate.order().getId());
        if (refunds.isEmpty()) {
            return List.of();
        }

        Map<UUID, OrderLine> myLinesById = candidate.myLines().stream()
                .collect(Collectors.toMap(OrderLine::getId, line -> line));
        Map<UUID, String> titles = productVariantSummaryQuery.productTitlesByIds(
                candidate.myLines().stream().map(OrderLine::getProductIdSnapshot).toList());

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
                        candidate.order().getId(),
                        OrderReferences.of(candidate.order().getId()),
                        refund.returnTrackingNumber(),
                        // The order knows the recipient; buyer_identity's own name is
                        // another feature's column and the shipping name is the one
                        // this order actually carries.
                        recipientOf(candidate.order()),
                        candidate.order().getBuyerEmailSnapshot(),
                        itemsOf(refund, myLinesById, titles)))
                .toList();
    }

    /** "2 x Aurora One Wireless Headphones, 1 x Travel Case", or null when none of the lines are ours. */
    private static String itemsOf(
            OrderRefundSnapshot refund, Map<UUID, OrderLine> myLinesById, Map<UUID, String> titles) {

        String items = refund.orderLineIds().stream()
                .map(myLinesById::get)
                .filter(line -> line != null)
                .map(line -> line.getQuantity() + " x "
                        + titles.getOrDefault(line.getProductIdSnapshot(), PRODUCT_REMOVED))
                .collect(Collectors.joining(", "));
        return items.isEmpty() ? null : items;
    }

    /**
     * The name on the parcel. The shipping address is NOT NULL on every order
     * checkout has ever written (V12), but the column set predates that migration, so
     * this copes with a row that has none rather than throwing while rendering a list.
     */
    private static String recipientOf(Order order) {
        Address address = order.getShippingAddress();
        return address == null || address.getFullName() == null
                ? order.getBuyerEmailSnapshot()
                : address.getFullName();
    }

    /** "Karachi, PK" - the table's Destination column. Null when there is no address. */
    private static String destinationOf(Order order) {
        Address address = order.getShippingAddress();
        if (address == null || address.getCity() == null) {
            return null;
        }
        return address.getCountry() == null
                ? address.getCity()
                : address.getCity() + ", " + address.getCountry();
    }

    private static AddressResponse toAddress(Order order) {
        Address address = order.getShippingAddress();
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

    /**
     * Null when nothing is known, so a screen reading {@code shipment?.trackingNumber}
     * prints nothing rather than a tracking panel with seven blank rows in it.
     *
     * carrier, trackingUrl, estimatedDeliveryAt and deliveredAt have no column
     * anywhere in this schema and stay null: an ETA the server guessed is a promise
     * nobody made, and there is no carrier to name. deliveryNote carries the note the
     * seller left when they handed the parcel over - the one field of the seven this
     * system does have something honest to put in.
     */
    private ShipmentInfoResponse shipmentFor(Order order) {
        if (order.getTrackingNumber() == null && order.getShippedAt() == null) {
            return null;
        }
        return new ShipmentInfoResponse(
                null,
                order.getTrackingNumber(),
                null,
                order.getShippedAt(),
                null,
                null,
                handoverNoteOf(order.getId()));
    }

    /** The note from the most recent handover, or null if there was none. */
    private String handoverNoteOf(UUID orderId) {
        return orderEventRepository.findByOrderIdOrderByOccurredAtAscRecordedAtAsc(orderId).stream()
                .filter(event -> OrderStatus.SHIPPED.name().equals(event.getStatus()))
                .map(OrderEvent::getNote)
                .filter(note -> note != null)
                .reduce((earlier, later) -> later)
                .orElse(null);
    }

    /**
     * The sorts the contract offers. An unknown value is the default rather than a
     * 422: a sort is a presentation choice, and a stale bookmark carrying a retired
     * one should still show the seller their orders.
     */
    private enum SellerOrderSort {

        NEWEST("newest"),
        OLDEST("oldest"),
        TOTAL_DESC("total_desc"),
        TOTAL_ASC("total_asc");

        private static final Set<String> KNOWN = Set.of("newest", "oldest", "total_desc", "total_asc");

        private final String wireValue;

        SellerOrderSort(String wireValue) {
            this.wireValue = wireValue;
        }

        static SellerOrderSort from(String raw) {
            if (raw == null || !KNOWN.contains(raw.trim().toLowerCase(Locale.ROOT))) {
                return NEWEST;
            }
            String normalized = raw.trim().toLowerCase(Locale.ROOT);
            return java.util.Arrays.stream(values())
                    .filter(sort -> sort.wireValue.equals(normalized))
                    .findFirst()
                    .orElse(NEWEST);
        }

        /**
         * Every comparator is tie-broken by order id, for the reason
         * OrderRepository.findForSeller gives: placed_at defaults to now(), two orders
         * can share one, and an unstable boundary shows a row on two pages.
         */
        Comparator<Candidate> comparator() {
            Comparator<Candidate> byId = Comparator.comparing(candidate -> candidate.order().getId());
            return switch (this) {
                case NEWEST -> Comparator.comparing(
                        (Candidate candidate) -> candidate.order().getPlacedAt()).reversed().thenComparing(byId);
                case OLDEST -> Comparator.comparing(
                        (Candidate candidate) -> candidate.order().getPlacedAt()).thenComparing(byId);
                case TOTAL_DESC -> Comparator.comparing(Candidate::myTotal).reversed().thenComparing(byId);
                case TOTAL_ASC -> Comparator.comparing(Candidate::myTotal).thenComparing(byId);
            };
        }
    }
}
