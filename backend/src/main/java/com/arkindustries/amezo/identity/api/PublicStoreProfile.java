package com.arkindustries.amezo.identity.api;

import java.time.Instant;
import java.util.UUID;

/**
 * A storefront's own fields as the public store page shows them - everything
 * seller_store holds that a shopper may see, and nothing else.
 *
 * Deliberately NOT the SellerStore entity: crossing a feature boundary with a
 * managed entity hands the caller lazy associations and a lifecycle it has no
 * business touching (PackageBoundaryTest), and this leaves out supportEmail and
 * foundedYear - one is the seller's inbox and the other belongs to their own
 * settings screen, neither is on the contract's PublicStore.
 *
 * {@code sellerId} rather than the seller_store row's id, matching
 * {@link StoreRef}: it is the id every other feature already holds, and the one
 * PublicStore.id has to carry for a storefront to recognise its own listings.
 *
 * {@code joinedAt} is when the SELLER joined Amezo (seller.created_at), which is
 * what the storefront's "Since 2021" means - not when the store row was
 * provisioned, and not StoreProfile.foundedYear, which is when the business began.
 *
 * <h2>What is not here, and why</h2>
 *
 * The contract's PublicStore also declares {@code policies} (shipping, returns,
 * warranty, shipsFrom), {@code positiveRatingPct} and {@code medianResponseMinutes}.
 * No column anywhere holds any of them and no screen can author them: Store Settings
 * has no policy fields in the design, nothing records a response time, and there is
 * no seller-feedback rating separate from product reviews. They are returned null
 * rather than invented - a shipping promise this server made up would be a promise
 * the seller never made.
 */
public record PublicStoreProfile(
        UUID sellerId,
        String name,
        String handle,
        String tagline,
        String location,
        String about,
        String coverUrl,
        String logoUrl,
        /** OPEN, VACATION or CLOSED - the StoreStatus name, as a String for the reason StoreRef's status fields are. */
        String status,
        String vacationNote,
        Instant joinedAt) {
}
