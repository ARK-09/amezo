package com.arkindustries.amezo.refunds;

/**
 * Money back, or the same item again. The contract's RefundResolution.
 *
 * Held twice on a request - once as the buyer's ask (requestedResolution) and
 * once as what the seller settled on (resolution) - because the two need not
 * agree: the seller may answer a replacement request with money or the reverse,
 * and overwriting the ask would lose the fact that they did.
 */
public enum RefundResolution {
    REFUND,
    REPLACEMENT
}
