package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.common.exception.ConflictException;

import java.net.URI;
import java.util.List;
import java.util.Set;

/**
 * The statuses a SELLER may write, and the legal moves between them - the
 * contract's SellerOrderTransition.
 *
 * Narrower than {@link OrderStatus} because most of that enum is not the seller's
 * to declare: IN_TRANSIT and OUT_FOR_DELIVERY are carrier states nothing here can
 * report, and REFUNDED is derived from the refund request. What is left is the part
 * of fulfilment the seller performs by hand - plus DELIVERED, which is theirs only
 * until a carrier can report it.
 *
 * The guard lives here rather than in the service so that "which moves are legal"
 * is one table to read instead of a chain of if statements, and so the 409 says
 * which move was refused.
 */
public enum SellerOrderTransition {

    /** Boxed and waiting for collection. Only from PLACED. */
    PACKED(Set.of(OrderStatus.PLACED)),

    /**
     * Handed over to Amezo. From PACKED, or straight from PLACED: a seller who
     * hands a parcel over without recording the packing step has still shipped it,
     * and refusing that would only teach them to file a fake packing event first.
     */
    SHIPPED(Set.of(OrderStatus.PLACED, OrderStatus.PACKED)),

    /**
     * It arrived.
     *
     * A STAND-IN for carrier reporting, which does not exist: there is no
     * integration and no webhook, so DELIVERED was a status nothing could ever
     * write and the "Delivered" tab was permanently empty. Until something can
     * report it, the seller says so by hand and V26's delivered_at records when
     * they said it.
     *
     * From PACKED as well as SHIPPED, for the reason SHIPPED accepts PLACED: a
     * seller who never got round to recording the handover has still delivered the
     * parcel, and refusing that would only teach them to file a handover they did
     * not make. Not from PLACED - an order nobody has even packed has not arrived,
     * and if it truly has, recording the handover first is one click.
     */
    DELIVERED(Set.of(OrderStatus.PACKED, OrderStatus.SHIPPED)),

    /**
     * Called off before it went anywhere. PLACED only - once a parcel is packed or
     * handed over, stopping it is a return, which is what the refund flow is for.
     */
    CANCELLED(Set.of(OrderStatus.PLACED));

    private final Set<OrderStatus> allowedFrom;

    SellerOrderTransition(Set<OrderStatus> allowedFrom) {
        this.allowedFrom = allowedFrom;
    }

    OrderStatus target() {
        return OrderStatus.valueOf(name());
    }

    /**
     * 409, not 422: the request is well-formed and the seller is allowed to make
     * this kind of move - it is the order's current state that refuses it, and the
     * same request would have succeeded a moment earlier.
     */
    void checkAllowedFrom(OrderStatus current) {
        if (!allowedFrom.contains(current)) {
            throw new ConflictException(
                    URI.create("https://api/errors/invalid-transition"),
                    "Invalid transition",
                    "An order that is " + current + " cannot be marked " + name(),
                    List.of());
        }
    }
}
