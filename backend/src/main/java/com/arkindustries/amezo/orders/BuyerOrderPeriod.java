package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.common.exception.UnprocessableEntityException;

import java.net.URI;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * The window tokens GET /api/v1/orders/facets takes.
 *
 * The facet endpoint takes a `period` token while the list beside it takes a
 * plain `from` date, and that asymmetry is the contract's, not an oversight
 * here: the tab strip and the list are two requests, and only one of them may
 * be narrowed by the selected tab. The strip therefore has to be able to ask
 * for "the same window the list is showing" without the client's clock being
 * the thing that decides what that window is for a COUNT.
 *
 * The day counts are the client's, exactly: MyOrders.tsx turns its period select
 * into `from` with the same 30 / 183 / 365. They have to match to the day, or a
 * tab reads "3" and opens a list of two.
 */
enum BuyerOrderPeriod {

    /** No window at all - "All time". */
    ALL("all", null),
    PAST_30_DAYS("30d", 30),
    /** Six months as the client counts them: half of 365, not six calendar months. */
    PAST_6_MONTHS("6m", 183),
    PAST_12_MONTHS("12m", 365);

    private final String wireValue;
    private final Integer days;

    BuyerOrderPeriod(String wireValue, Integer days) {
        this.wireValue = wireValue;
        this.days = days;
    }

    String wireValue() {
        return wireValue;
    }

    /**
     * Null and blank mean ALL. An unrecognised token is a 422 naming the field
     * rather than a silent fall back to "all time": the whole job of this
     * parameter is to make a count agree with a list, and the failure mode of
     * guessing is a tab whose number is wrong with nothing on screen to say so.
     */
    static BuyerOrderPeriod from(String raw) {
        if (raw == null || raw.isBlank()) {
            return ALL;
        }
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(period -> period.wireValue.equals(normalized))
                .findFirst()
                .orElseThrow(() -> new UnprocessableEntityException(
                        URI.create("https://api/errors/validation"),
                        "Validation failed",
                        "Unknown period: " + raw,
                        List.of(new UnprocessableEntityException.FieldError(
                                "period",
                                "must be one of " + Arrays.stream(values())
                                        .map(BuyerOrderPeriod::wireValue)
                                        .toList()))));
    }

    /**
     * The inclusive first day of the window, or null for no lower bound.
     *
     * UTC, because placed_at is a TIMESTAMPTZ and the server has no idea which
     * day it is where the buyer is standing. The client computes its own `from`
     * against the browser's clock, so the two can differ by a day at the very
     * edge of the window - which moves at most one order between two adjacent
     * counts and is the price of a boundary that is a date rather than an
     * instant.
     */
    LocalDate startDate() {
        return days == null ? null : LocalDate.now(ZoneOffset.UTC).minusDays(days);
    }
}
