package com.arkindustries.amezo.orders.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The seller's order drawer - the contract's SellerOrderRowDetail.
 *
 * Every money field and every line is THIS SELLER'S share of the order, for the
 * reason SellerOrderRowResponse gives: one order can carry several sellers' lines.
 *
 * {@code shipping} and {@code tax} are zero rather than null because the contract
 * requires shipping as a number and because zero is the true total of what this
 * marketplace adds on top of the line prices - there is no rate table, no nexus and
 * no carrier price anywhere in the schema. Same constant, same reasoning, as
 * BuyerOrderService.
 *
 * {@code status} is a String: see SellerOrderRowResponse.
 */
public record SellerOrderRowDetailResponse(
        UUID id,
        String reference,
        String buyerEmail,
        String recipientName,
        Instant placedAt,
        String status,
        List<SellerOrderLineResponse> lines,
        BigDecimal subtotal,
        BigDecimal shipping,
        BigDecimal tax,
        BigDecimal total,
        String currency,
        AddressResponse shippingAddress,
        ShipmentInfoResponse shipment,
        Instant packedAt,
        Integer parcels,
        List<OrderRefundSummaryResponse> refundRequests
) {
}
