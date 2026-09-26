package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.identity.api.CurrentBuyer;
import com.arkindustries.amezo.orders.dto.AddressResponse;
import com.arkindustries.amezo.orders.dto.LastCheckoutDetailsResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * The most recent order's delivery details for the signed-in buyer.
 *
 * Reads the order snapshot rather than a saved-address book because there isn't
 * one: an address only exists here as the copy taken at checkout. That copy is the
 * right source anyway - it is what they actually shipped to last, not an aspiration
 * they saved once and never used.
 */
@Service
public class LastCheckoutDetailsService {

    private final OrderRepository orderRepository;
    private final CurrentBuyer currentBuyer;

    public LastCheckoutDetailsService(OrderRepository orderRepository, CurrentBuyer currentBuyer) {
        this.orderRepository = orderRepository;
        this.currentBuyer = currentBuyer;
    }

    /**
     * Empty for a buyer who has never ordered, which the controller answers as 204.
     * That is not an error and must not read as one: the form simply stays blank and
     * they fill it in, exactly as a first-time buyer does.
     */
    @Transactional(readOnly = true)
    public Optional<LastCheckoutDetailsResponse> lastDetails() {
        return orderRepository
                .findFirstByBuyerIdentityIdOrderByPlacedAtDesc(currentBuyer.buyerIdentityId())
                .map(order -> new LastCheckoutDetailsResponse(
                        order.getBuyerPhone(),
                        toResponse(order.getShippingAddress()),
                        order.isBillingSameAsShipping(),
                        // Null when the last order billed to the shipping address.
                        // Checkout copies shipping into the billing columns in that
                        // case (they are NOT NULL), so the stored billing address is
                        // an echo rather than a separate answer - handing it back
                        // would prefill a billing form the buyer never filled in.
                        // The flag above is what tells the form which it was.
                        order.isBillingSameAsShipping()
                                ? null
                                : toResponse(order.getBillingAddress())));
    }

    private static AddressResponse toResponse(Address address) {
        if (address == null || address.getLine1() == null) {
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
}
