package com.arkindustries.amezo.catalog.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A storefront's header - the contract's PublicStore, served by
 * GET /api/v1/stores/{handle}.
 *
 * {@code id} is the SELLER's id, the same value ProductSummary.store.id carries, so a
 * storefront recognises its own listings by key rather than by matching a display
 * name. See identity.api.StoreRef for why that is the id and not the seller_store
 * row's.
 *
 * <h2>The three fields that are always null, and why they are not faked</h2>
 *
 * <ul>
 *   <li>{@code policies} - no columns and no authoring screen; see
 *       {@link StorePoliciesResponse}.</li>
 *   <li>{@code positiveRatingPct} - this would be seller feedback, which is a
 *       different thing from the product reviews below it: a product's rating is about
 *       the product, not about how the shop trades. Nothing records it.</li>
 *   <li>{@code medianResponseMinutes} - nothing measures how fast a seller replies,
 *       because there is no seller inbox to measure.</li>
 * </ul>
 *
 * {@code following} is null rather than false, which the contract distinguishes: false
 * would claim the caller is not following a store they could follow, and no follow
 * relation exists in this system at all - the storefront hides the button rather than
 * showing one that cannot work.
 */
public record PublicStoreResponse(
        UUID id,
        String name,
        String handle,
        String tagline,
        String location,
        String about,
        String coverUrl,
        String logoUrl,
        String status,
        String vacationNote,
        long productCount,
        long inStockCount,
        Double averageRating,
        long ratingCount,
        StorePoliciesResponse policies,
        List<CategoryResponse> categories,
        Instant joinedAt,
        Double positiveRatingPct,
        Integer medianResponseMinutes,
        Boolean following) {

    /** Everything this system can honestly say about a store, with the rest left null. */
    public static PublicStoreResponse of(
            UUID sellerId,
            String name,
            String handle,
            String tagline,
            String location,
            String about,
            String coverUrl,
            String logoUrl,
            String status,
            String vacationNote,
            long productCount,
            long inStockCount,
            Double averageRating,
            long ratingCount,
            List<CategoryResponse> categories,
            Instant joinedAt) {

        return new PublicStoreResponse(
                sellerId, name, handle, tagline, location, about, coverUrl, logoUrl, status,
                vacationNote, productCount, inStockCount, averageRating, ratingCount,
                StorePoliciesResponse.NONE_AUTHORED, categories, joinedAt, null, null, null);
    }
}
