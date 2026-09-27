package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * The contract's BuyerOrderLine, field for field
 * (frontend/openapi/fixture.yaml).
 *
 * Distinct from OrderLineResponse, which the seller's order detail uses: that
 * one carries what a seller needs (title, variant, money) and this one also
 * carries what a buyer's card links and pictures - productRef, the slug a
 * product link is built from, and a thumbnail.
 *
 * productTitle / variantLabel / thumbnailUrl are read from the catalog as it is
 * TODAY, via catalog.api, not from the order. The line itself only stores ids
 * (see OrderLine's doc comment on why the snapshots are not foreign keys), so a
 * renamed product shows its new name here - which is the behaviour the seller's
 * order detail already has, and the same "(product removed)" fallback when the
 * catalog row is gone for good.
 *
 * refundRequestId / refundStatus are null in every response today. The contract
 * sets them "when this line is inside an open refund request", and refunds are
 * modelled once, by refund_request - a table that does not exist yet. Populating
 * them needs one batched query from the refund feature, not a second refund
 * model in here; see BuyerOrderService for exactly what that query has to be.
 */
public record BuyerOrderLineResponse(
        UUID id,
        String productRef,
        String productTitle,
        String variantLabel,
        String thumbnailUrl,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal,
        UUID refundRequestId,
        String refundStatus
) {
}
