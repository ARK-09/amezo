package com.arkindustries.amezo.orders.dto;

import com.arkindustries.amezo.orders.HandoverMethod;
import com.arkindustries.amezo.orders.SellerOrderTransition;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;

import java.time.Instant;

/**
 * The contract's UpdateSellerOrder - one PATCH that advances the order, replacing
 * POST /sellers/me/orders/{id}/ship, which put the verb in the path.
 *
 * Every field but {@code status} is optional, and deliberately so: the contract
 * marks none of them required, and a seller who records a handover without naming
 * the hub has still handed the parcel over. Nothing is defaulted on their behalf -
 * an absent parcel count is stored as absent rather than silently becoming 1.
 *
 * No trackingNumber. It is issued by the platform on handover (TrackingNumbers),
 * not typed by the seller, so accepting one here would let a client claim a
 * shipment identifier the carrier never heard of.
 *
 * {@code occurredAt} is @PastOrPresent because the point of the field is a seller
 * recording yesterday's handover today; tomorrow's handover has not happened. An
 * absent value means now.
 */
public record UpdateSellerOrderRequest(
        @NotNull SellerOrderTransition status,
        @Min(1) Integer parcels,
        String packedBy,
        HandoverMethod handoverMethod,
        String hub,
        String note,
        @PastOrPresent Instant occurredAt
) {
}
