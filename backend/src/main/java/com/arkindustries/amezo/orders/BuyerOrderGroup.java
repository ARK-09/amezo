package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.common.exception.UnprocessableEntityException;

import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The coarse buckets the buyer's My Orders tabs group by - the contract's
 * `group` query parameter, and the `key` of every facet the tab strip reads.
 *
 * A group is NOT a status. "In progress" spans three fulfilment states and
 * "Refunds & returns" is not a fulfilment state at all, which is why the tabs
 * take this and the contract keeps `status` as a separate, finer filter.
 *
 * Parsed by hand out of its wire spelling rather than bound straight to the enum
 * by Spring. Spring's default query-parameter conversion matches enum constants
 * exactly, so `?group=in_progress` would 400 with a type-mismatch message that
 * names Java's constant and not the buyer's tab - and a silent fallback to `all`
 * would show a tab whose count says one thing and whose list says another.
 */
enum BuyerOrderGroup {

    ALL("all"),
    IN_PROGRESS("in_progress"),
    DELIVERED("delivered"),
    REFUNDS("refunds");

    /**
     * Statuses that mean the order is finished, whatever the outcome - the
     * complement of "In progress".
     *
     * Held as NAMES and not as OrderStatus constants on purpose: REFUNDED is derived
     * from a settled refund request rather than declared, so the Java enum has no
     * such constant and the derived status this predicate is given is a String.
     */
    private static final Set<String> TERMINAL_STATUS_NAMES = Set.of("DELIVERED", "CANCELLED", "REFUNDED");

    private final String wireValue;

    BuyerOrderGroup(String wireValue) {
        this.wireValue = wireValue;
    }

    String wireValue() {
        return wireValue;
    }

    /** Every bucket, in the order the tab strip prints them. */
    static List<BuyerOrderGroup> tabs() {
        return List.of(values());
    }

    /**
     * Null and blank mean ALL - the tab the page opens on, and what an absent
     * parameter has to mean for the un-narrowed facet counts to be reachable.
     */
    static BuyerOrderGroup from(String raw) {
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
                                        .map(BuyerOrderGroup::wireValue)
                                        .toList()))));
    }

    /**
     * Whether an order belongs in this bucket.
     *
     * Takes the DERIVED status - the one the card reports, with REFUNDED already
     * overlaid - rather than {@code order.getStatus()}, so a settled refund cannot be
     * counted in "Delivered" by the facets and shown as refunded by the list. A String
     * for the same reason the response field is one: REFUNDED is not a value
     * {@link OrderStatus} can hold. {@link SellerOrderGroup#contains} takes its status
     * the same way.
     *
     * hasRefundRequest is ANY request against the order, settled ones included, and
     * not just a live one. "Refunds &amp; returns" is where a buyer goes to find out
     * what happened to a return - so a refund vanishing from the tab at the moment it
     * was paid out would hide it exactly when they came looking. A request that is
     * still being argued over is ALSO in whichever fulfilment bucket the order is
     * really in, which is what the card's own badge is for.
     */
    boolean contains(String derivedStatus, boolean hasRefundRequest) {
        return switch (this) {
            case ALL -> true;
            case IN_PROGRESS -> !TERMINAL_STATUS_NAMES.contains(derivedStatus);
            case DELIVERED -> OrderStatus.DELIVERED.name().equals(derivedStatus);
            case REFUNDS -> hasRefundRequest;
        };
    }
}
