package com.arkindustries.amezo.refunds.dto;

import com.arkindustries.amezo.refunds.RefundStatus;

import java.time.Instant;

/**
 * The contract's RefundEvent: one step of the History timeline, newest last.
 *
 * {@code note} is what makes the log necessary rather than a convenience - see
 * RefundEventRecord. The seller writes it on the same action that approves or
 * declines, and it is printed against that step.
 */
public record RefundEventResponse(RefundStatus status, Instant at, String note) {
}
