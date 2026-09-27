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
     * Held as NAMES and not as OrderStatus constants on purpose. The contract's
     * OrderStatus already has CANCELLED and REFUNDED; the Java enum does not
     * yet, because nothing writes them (see OrderStatus, and the decision that
     * REFUNDED is derived from a settled refund request rather than declared).
     * Naming them here means the day the enum gains either one, a cancelled
     * order stops being counted as "In progress" without anybody having to
     * remember this file existed.
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
     * hasOpenRefund is passed in rather than read from the order: refunds are
     * modelled once, by refund_request, and that table does not exist yet. Today
     * every caller passes false and the Refunds tab honestly counts zero; when
     * the refund domain lands, this predicate is already the only place that has
     * to learn about it.
     */
    boolean contains(OrderStatus status, boolean hasOpenRefund) {
        return switch (this) {
            case ALL -> true;
            case IN_PROGRESS -> !TERMINAL_STATUS_NAMES.contains(status.name());
            case DELIVERED -> status == OrderStatus.DELIVERED;
            case REFUNDS -> hasOpenRefund;
        };
    }
}
