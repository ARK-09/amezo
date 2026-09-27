package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.common.exception.UnprocessableEntityException;

import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * The six buckets the Seller Orders tab strip groups by - the contract's `group`
 * query parameter, and the `key` of every facet the strip reads.
 *
 * A group is coarser than a status, which is the whole reason it exists: "With
 * Amezo" is SHIPPED, IN_TRANSIT and OUT_FOR_DELIVERY at once, and a single
 * ?status= cannot express that. The finer ?status= stays a separate filter, and
 * both apply when both are given.
 *
 * Parsed by hand out of its wire spelling rather than bound straight to the enum
 * by Spring, exactly as {@link BuyerOrderGroup} is: Spring's default query
 * conversion matches enum constants exactly, so {@code ?group=to_pack} would 400
 * with a type-mismatch message naming a Java constant instead of the seller's tab.
 */
enum SellerOrderGroup {

    /**
     * Everything, and the only bucket a CANCELLED order is in. The design has no
     * Cancelled tab, so rather than invent one - or file cancelled orders under a
     * fulfilment stage they never reached - they are reachable here and through
     * {@code ?status=CANCELLED}. The five narrow buckets therefore do not sum to
     * this one, which is also already true of Refunded.
     */
    ALL("all"),

    /** Waiting to be boxed. */
    TO_PACK("to_pack"),

    /** Boxed, waiting for Amezo to collect it. */
    READY_FOR_PICKUP("ready_for_pickup"),

    /**
     * In Amezo's hands and not yet delivered. Spans the three carrier states, of
     * which only SHIPPED can occur today - nothing reports transit (see
     * {@link OrderStatus}). The tab is still the right shape: the day a carrier
     * webhook lands, an order moving to IN_TRANSIT stays in this bucket instead of
     * vanishing from every tab.
     */
    WITH_AMEZO("with_amezo"),

    DELIVERED("delivered"),

    /**
     * SETTLED refunds, not requested ones. An order with a refund still being
     * argued over is in whichever fulfilment bucket it is actually in, with the
     * row's own {@code hasOpenRefund} pill saying a request is live; it moves here
     * once the money has gone back, which is exactly when its status derives to
     * REFUNDED.
     */
    REFUNDED("refunded");

    /** Statuses "With Amezo" covers, by NAME so the two this enum cannot hold yet still count. */
    private static final List<String> IN_CARRIER_HANDS_NAMES =
            List.of("SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY");

    private final String wireValue;

    SellerOrderGroup(String wireValue) {
        this.wireValue = wireValue;
    }

    String wireValue() {
        return wireValue;
    }

    /** Every bucket, in the order the tab strip prints them. */
    static List<SellerOrderGroup> tabs() {
        return List.of(values());
    }

    /**
     * Null and blank mean ALL - the tab the page opens on, and what an absent
     * parameter has to mean for the un-narrowed facet counts to be reachable.
     */
    static SellerOrderGroup from(String raw) {
        if (raw == null || raw.isBlank()) {
            return ALL;
        }
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(group -> group.wireValue.equals(normalized))
                .findFirst()
                .orElseThrow(() -> new UnprocessableEntityException(
                        URI.create("https://api/errors/validation"),
                        "Validation failed",
                        "Unknown order group: " + raw,
                        List.of(new UnprocessableEntityException.FieldError(
                                "group",
                                "must be one of " + Arrays.stream(values())
                                        .map(SellerOrderGroup::wireValue)
                                        .toList()))));
    }

    /**
     * Whether an order belongs in this bucket.
     *
     * Takes the DERIVED status - the one the row reports, with REFUNDED already
     * overlaid - rather than {@code order.getStatus()}, so a settled refund cannot
     * be counted in "Delivered" by the facets and in "Refunded" by the list. A
     * String for the same reason the response field is one: REFUNDED is not a value
     * {@link OrderStatus} can hold.
     */
    boolean contains(String derivedStatus) {
        return switch (this) {
            case ALL -> true;
            case TO_PACK -> OrderStatus.PLACED.name().equals(derivedStatus);
            case READY_FOR_PICKUP -> OrderStatus.PACKED.name().equals(derivedStatus);
            case WITH_AMEZO -> IN_CARRIER_HANDS_NAMES.contains(derivedStatus);
            case DELIVERED -> OrderStatus.DELIVERED.name().equals(derivedStatus);
            case REFUNDED -> REFUNDED_STATUS.equals(derivedStatus);
        };
    }

    /**
     * Held as a String because {@link OrderStatus} deliberately has no REFUNDED
     * constant - it is derived from the refund request and never stored.
     */
    static final String REFUNDED_STATUS = "REFUNDED";
}
