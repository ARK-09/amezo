package com.arkindustries.amezo.orders.dto;

import java.util.List;

/**
 * The contract's FacetList - a wrapper object rather than a bare array.
 *
 * The wrapper is the contract's choice and worth keeping: a top-level JSON array
 * is a response that can never gain a field, and a tab strip that later wants a
 * "counts as of" timestamp or a total across buckets would need a new endpoint to
 * get one.
 */
public record FacetListResponse(List<FacetResponse> facets) {
}
