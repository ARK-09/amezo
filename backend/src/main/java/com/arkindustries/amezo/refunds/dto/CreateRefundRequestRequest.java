package com.arkindustries.amezo.refunds.dto;

import com.arkindustries.amezo.refunds.RefundPayout;
import com.arkindustries.amezo.refunds.RefundResolution;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * The contract's CreateRefundRequest - what the buyer's Refund Request form posts.
 *
 * {@code payout} is validated in the service, not here: it is required only when
 * the resolution is REFUND, which is a cross-field rule. It could be a class-level
 * @Constraint, and the one in orders (ValidCheckoutRequest) is - but that one
 * guards several fields at once, and a single conditional requirement reads better
 * as the 422 the service already raises for every other conditional rule on this
 * endpoint (the return window, the quantity ceiling), with the field named in
 * errors[] either way.
 */
public record CreateRefundRequestRequest(

        @NotNull UUID orderId,

        @NotEmpty(message = "pick at least one item") @Valid List<Line> lines,

        @NotNull RefundResolution resolution,

        RefundPayout payout,

        /**
         * The floor is the contract's, the design's ("At least 20 characters so the
         * seller can act on it") and the column's. Three copies on purpose: the
         * form stops a wasted round trip, this stops a client that skipped the
         * form, and the CHECK in V21 stops anything that skipped the API.
         */
        @NotNull @Size(min = 20, max = 4000, message = "at least 20 characters") String detail
) {

    public record Line(@NotNull UUID orderLineId, @NotNull Integer quantity) {
    }
}
