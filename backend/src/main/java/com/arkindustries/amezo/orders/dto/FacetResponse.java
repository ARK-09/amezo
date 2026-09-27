package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;

/**
 * The contract's Facet: one tab, and the count on it.
 *
 * `key` is whatever the matching list endpoint accepts for that bucket - for the
 * buyer's orders, a BuyerOrderGroup wire value - so a tab needs no translation
 * table to become a filter.
 *
 * value and currency are null for every buyer bucket. The contract says money
 * belongs here "where the design prints it", and the My Orders tab strip prints
 * counts only; a total nobody shows is a sum the server computes on every request
 * for nothing.
 */
public record FacetResponse(String key, long count, BigDecimal value, String currency) {

    /** A count-only bucket, which is every bucket the buyer's tabs have. */
    public static FacetResponse counted(String key, long count) {
        return new FacetResponse(key, count, null, null);
    }
}
