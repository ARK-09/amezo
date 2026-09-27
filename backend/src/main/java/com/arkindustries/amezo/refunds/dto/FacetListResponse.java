package com.arkindustries.amezo.refunds.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * The contract's FacetList / Facet, for the refund queue's tab strip.
 *
 * {@code key} is whatever GET /api/v1/sellers/me/refund-requests takes for that
 * bucket - a RefundStatus name, or the literal "all" - so a tab becomes a filter
 * with no translation table. That is the contract's own wording and it is what the
 * frontend's FacetTabs relies on.
 *
 * <h2>value is populated, unlike the orders facets</h2>
 *
 * The Seller Refunds design prints money under every count ("3 · $327 at stake"),
 * so each bucket carries the sum of its requests' effective amounts. A bucket with
 * nothing in it sends 0 with a currency, not null: zero dollars at stake is a
 * true and useful statement, where null means "this bucket has no meaningful
 * total".
 *
 * <h2>Why a local copy of a shared shape</h2>
 *
 * Nothing in the backend defines a Facet yet - there is no facets endpoint of any
 * kind today. A shared DTO in {@code common} would be the right home once a second
 * feature serves one; putting it there now would mean guessing which fields that
 * feature needs. Flagged for whoever adds the orders facets: this is the shape to
 * promote.
 */
public record FacetListResponse(List<Facet> facets) {

    public record Facet(String key, long count, BigDecimal value, String currency) {
    }
}
