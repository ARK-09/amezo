package com.arkindustries.amezo.orders.dto;

import java.time.Instant;

/**
 * The contract's ShipmentInfo.
 *
 * Only two of its seven fields have anything behind them: orders.tracking_number
 * and orders.shipped_at, both written by the seller's ship() call. carrier,
 * trackingUrl, estimatedDeliveryAt, deliveredAt and deliveryNote have no column
 * anywhere in the schema and are returned null rather than invented - an ETA the
 * server guessed is a promise nobody made, and a "delivered on" date derived from
 * a status with no timestamp beside it would be a fabrication with a date on it.
 *
 * BuyerOrderService returns null for the whole object when nothing is known, so
 * a screen reading `shipment?.estimatedDeliveryAt` prints nothing instead of an
 * empty tracking panel.
 */
public record ShipmentInfoResponse(
        String carrier,
        String trackingNumber,
        String trackingUrl,
        Instant shippedAt,
        Instant estimatedDeliveryAt,
        Instant deliveredAt,
        String deliveryNote
) {
}
