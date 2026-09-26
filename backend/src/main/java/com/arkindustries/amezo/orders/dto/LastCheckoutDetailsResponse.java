package com.arkindustries.amezo.orders.dto;

/**
 * What a returning buyer last checked out with, so the checkout form can arrive
 * filled in instead of asking them to retype an address they have already given.
 *
 * Deliberately not an order: it carries no id, no total and no lines, because the
 * only thing being answered is "where do your parcels go". There is no buyer order
 * history API and this is not the start of one - exposing an order shape here would
 * make it one by accident.
 *
 * The email is not here either. The session already knows it (GET /sessions/current),
 * and the address snapshot's is a historical copy that can disagree with the identity's
 * current address - prefilling from the stale one is how someone's old email gets
 * quietly reattached to a new order.
 */
public record LastCheckoutDetailsResponse(
        String phone,
        AddressResponse shippingAddress,
        boolean billingSameAsShipping,
        AddressResponse billingAddress
) {
}
