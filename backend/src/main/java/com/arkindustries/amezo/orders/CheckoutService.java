package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.api.OfferCheckoutQuery;
import com.arkindustries.amezo.catalog.api.OfferSnapshot;
import com.arkindustries.amezo.catalog.api.OfferStockService;
import com.arkindustries.amezo.common.exception.ConflictException;
import com.arkindustries.amezo.identity.api.BuyerIdentityLookup;
import com.arkindustries.amezo.identity.api.SellerIdentityQuery;
import com.arkindustries.amezo.orders.dto.CheckoutAddressRequest;
import com.arkindustries.amezo.orders.dto.CheckoutLineRequest;
import com.arkindustries.amezo.orders.dto.CheckoutRequest;
import com.arkindustries.amezo.orders.dto.OrderLineResponse;
import com.arkindustries.amezo.orders.dto.OrderResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class CheckoutService {

    private static final URI OUT_OF_STOCK = URI.create("https://api/errors/out-of-stock");
    private static final URI PRICE_CHANGED = URI.create("https://api/errors/price-changed");
    private static final URI OWN_PRODUCT = URI.create("https://api/errors/own-product");

    private final OrderRepository orderRepository;
    private final OrderLineRepository orderLineRepository;
    private final OfferCheckoutQuery offerCheckoutQuery;
    private final OfferStockService offerStockService;
    private final BuyerIdentityLookup buyerIdentityLookup;
    private final SellerIdentityQuery sellerIdentityQuery;

    public CheckoutService(
            OrderRepository orderRepository,
            OrderLineRepository orderLineRepository,
            OfferCheckoutQuery offerCheckoutQuery,
            OfferStockService offerStockService,
            BuyerIdentityLookup buyerIdentityLookup,
            SellerIdentityQuery sellerIdentityQuery) {
        this.orderRepository = orderRepository;
        this.orderLineRepository = orderLineRepository;
        this.offerCheckoutQuery = offerCheckoutQuery;
        this.offerStockService = offerStockService;
        this.buyerIdentityLookup = buyerIdentityLookup;
        this.sellerIdentityQuery = sellerIdentityQuery;
    }

    /**
     * One order per call, regardless of how many sellers its lines belong
     * to - see the ADR/API-design deviation noted when this was built.
     * No payment step: this call IS the whole checkout, atomically.
     */
    @Transactional
    public OrderResponse checkout(CheckoutRequest request) {
        List<CheckoutLineRequest> lines = request.lines();
        List<UUID> variantIds = lines.stream().map(CheckoutLineRequest::variantId).distinct().toList();
        Map<UUID, OfferSnapshot> offersByVariantId = offerCheckoutQuery.findByVariantIds(variantIds);

        // Before stock and price, because this is a rule about who may buy at all,
        // and an out-of-stock message would hide it.
        failOnOwnProducts(lines, offersByVariantId, request.email());
        failOnStockProblems(lines, offersByVariantId);
        failOnPriceDrift(lines, offersByVariantId);
        decrementStockOrAbort(lines, offersByVariantId);

        UUID buyerIdentityId =
                buyerIdentityLookup.findOrCreateByEmail(request.email(), request.shippingAddress().fullName());

        Address shippingAddress = toAddress(request.shippingAddress());
        Address billingAddress =
                request.sameAsShipping() ? toAddress(request.shippingAddress()) : toAddress(request.billingAddress());

        // saveAndFlush for the same reason as the review's createdAt: placedAt comes
        // from @CreationTimestamp at INSERT, and the confirmation page reads it off
        // this response.
        Order order = orderRepository.saveAndFlush(Order.builder()
                .buyerIdentityId(buyerIdentityId)
                .buyerEmailSnapshot(request.email())
                .buyerPhone(request.phone())
                .shippingAddress(shippingAddress)
                .billingSameAsShipping(request.sameAsShipping())
                .billingAddress(billingAddress)
                .status(OrderStatus.PLACED)
                .build());

        List<OrderLineResponse> lineResponses = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (CheckoutLineRequest line : lines) {
            OfferSnapshot offer = offersByVariantId.get(line.variantId());
            OrderLine orderLine = orderLineRepository.save(OrderLine.builder()
                    .orderId(order.getId())
                    .offerId(offer.offerId())
                    .productIdSnapshot(offer.productId())
                    .variantIdSnapshot(offer.variantId())
                    .sellerIdSnapshot(offer.sellerId())
                    .unitPriceSnapshot(offer.price())
                    .quantity(line.quantity())
                    .build());

            BigDecimal lineTotal = offer.price().multiply(BigDecimal.valueOf(line.quantity()));
            total = total.add(lineTotal);
            lineResponses.add(new OrderLineResponse(
                    orderLine.getId(), offer.productTitle(), offer.variantLabel(), line.quantity(), offer.price(),
                    lineTotal));
        }

        return new OrderResponse(order.getId(), order.getPlacedAt(), lineResponses, total);
    }

    /**
     * A seller cannot buy their own listing.
     *
     * Enforced here, in the order path, because that is the only place it can be
     * enforced: the cart lives in the buyer's browser, so there is no server-side
     * cart to refuse, and a client that skips the disabled button reaches this
     * method anyway.
     *
     * Two identities are checked, and the second is the one that matters. A signed
     * -in seller is the easy case. The real bypass is signing out and checking out
     * as a guest with the same email, and since an order cannot be placed without
     * an email, that is always checkable.
     *
     * 409 with itemised errors[], not 403: checkout already reports every
     * line-level refusal this way (out-of-stock, price-changed), the buyer's next
     * move is the same - take those lines out of the cart - and naming the lines is
     * what makes that possible. A bare 403 would leave a cart of ten items with no
     * clue which two are the problem.
     */
    private void failOnOwnProducts(
            List<CheckoutLineRequest> lines, Map<UUID, OfferSnapshot> offersByVariantId, String email) {

        Set<UUID> callerSellerIds = new LinkedHashSet<>();
        sellerIdentityQuery.currentSellerId().ifPresent(callerSellerIds::add);
        sellerIdentityQuery.findIdByEmail(email).ifPresent(callerSellerIds::add);
        if (callerSellerIds.isEmpty()) {
            return;
        }

        List<ConflictException.FieldError> errors = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            OfferSnapshot offer = offersByVariantId.get(lines.get(i).variantId());
            // A line with no offer at all is failOnStockProblems' business, not
            // this method's - there is no seller to compare.
            if (offer != null && callerSellerIds.contains(offer.sellerId())) {
                errors.add(new ConflictException.FieldError(
                        "lines[%d].variantId".formatted(i), "you cannot buy your own product"));
            }
        }
        if (!errors.isEmpty()) {
            throw new ConflictException(OWN_PRODUCT, "Own product",
                    "An order cannot include your own products", errors);
        }
    }

    /**
     * Also where a variantId with no matching offer at all is reported -
     * folded into out-of-stock rather than a third error code, since only
     * two distinct codes were asked for and "no offer exists" is honestly
     * just a more permanent case of "not available in that quantity."
     */
    private void failOnStockProblems(List<CheckoutLineRequest> lines, Map<UUID, OfferSnapshot> offersByVariantId) {
        List<ConflictException.FieldError> errors = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            CheckoutLineRequest line = lines.get(i);
            OfferSnapshot offer = offersByVariantId.get(line.variantId());
            if (offer == null) {
                errors.add(new ConflictException.FieldError("lines[%d].variantId".formatted(i), "no longer available"));
            } else if (offer.stockQty() < line.quantity()) {
                errors.add(new ConflictException.FieldError(
                        "lines[%d].variantId".formatted(i),
                        "requested %d, available %d".formatted(line.quantity(), offer.stockQty())));
            }
        }
        if (!errors.isEmpty()) {
            throw new ConflictException(OUT_OF_STOCK, "Out of stock",
                    "One or more lines are no longer available in the requested quantity", errors);
        }
    }

    private void failOnPriceDrift(List<CheckoutLineRequest> lines, Map<UUID, OfferSnapshot> offersByVariantId) {
        List<ConflictException.FieldError> errors = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            CheckoutLineRequest line = lines.get(i);
            if (line.expectedUnitPrice() == null) {
                continue;
            }
            OfferSnapshot offer = offersByVariantId.get(line.variantId());
            if (offer != null && line.expectedUnitPrice().compareTo(offer.price()) != 0) {
                errors.add(new ConflictException.FieldError(
                        "lines[%d].variantId".formatted(i),
                        "expected %s, now %s".formatted(line.expectedUnitPrice(), offer.price())));
            }
        }
        if (!errors.isEmpty()) {
            throw new ConflictException(PRICE_CHANGED, "Price changed",
                    "One or more lines have a different price than expected", errors);
        }
    }

    /**
     * The race-proof half of the stock check: failOnStockProblems already
     * ran moments ago, so this should always succeed - if it doesn't,
     * something else decremented this offer in between, which @Transactional
     * rolling back is exactly what "no partial orders" requires.
     */
    private void decrementStockOrAbort(List<CheckoutLineRequest> lines, Map<UUID, OfferSnapshot> offersByVariantId) {
        for (CheckoutLineRequest line : lines) {
            OfferSnapshot offer = offersByVariantId.get(line.variantId());
            if (!offerStockService.decrementStock(offer.offerId(), line.quantity())) {
                throw new ConflictException(OUT_OF_STOCK, "Out of stock",
                        "Stock changed while placing the order - please try again", List.of());
            }
        }
    }

    private Address toAddress(CheckoutAddressRequest request) {
        return Address.builder()
                .fullName(request.fullName())
                .line1(request.line1())
                .line2(request.line2())
                .city(request.city())
                .state(request.state())
                .postalCode(request.postalCode())
                .country(request.country())
                .build();
    }
}
