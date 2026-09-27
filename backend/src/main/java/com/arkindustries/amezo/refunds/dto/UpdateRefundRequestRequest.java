package com.arkindustries.amezo.refunds.dto;

import com.arkindustries.amezo.refunds.RefundResolution;
import com.arkindustries.amezo.refunds.RefundStatus;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * The contract's UpdateRefundRequest: the state machine lives on the resource
 * rather than on action URLs, so one PATCH carries every decision.
 *
 * Everything but {@code status} is optional, and which of them are required
 * depends on the transition - {@code declineReason} on a decline,
 * {@code approvedAmount} on an approval that is meant to be partial. Those are
 * conditional rules the service raises 422s for, naming the field; an annotation
 * here could only make them unconditional.
 */
public record UpdateRefundRequestRequest(

        @NotNull RefundStatus status,

        /**
         * What the seller settles on, which need not be what the buyer asked for.
         * Absent means the buyer's ask stands.
         */
        RefundResolution resolution,

        /**
         * On an approval. Absent means the whole requested amount. Above it is an
         * over-refund and is refused; below it is a legitimate partial.
         *
         * The @DecimalMin is here because "zero or less" is not a conditional rule -
         * it is never valid, on any transition.
         */
        @DecimalMin(value = "0.01", message = "must be more than zero") BigDecimal approvedAmount,

        @Size(max = 500) String declineReason,

        /**
         * The reference the buyer quotes when posting the item back, if the seller
         * has one. Never minted by this application - there is no carrier
         * integration, and an invented label number would tell the buyer a prepaid
         * label exists when none does.
         */
        @Size(max = 64) String returnTrackingNumber,

        /** Shown to the buyer, recorded against the transition it accompanied. */
        @Size(max = 2000) String note
) {
}
