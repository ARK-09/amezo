package com.arkindustries.amezo.refunds;

/**
 * Where the buyer asked the money to go. The contract's RefundPayout, whose own
 * note explains the two values: the design offers "the card you paid with" or
 * "that card is closed, contact me", and nothing else - there is no store credit
 * in this marketplace to offer.
 *
 * Null on a replacement request, which moves no money. V21 makes that a CHECK
 * rather than a convention.
 */
public enum RefundPayout {

    /** Back to whatever paid for the order. */
    ORIGINAL_PAYMENT,

    /**
     * The original method is gone and support has to collect new details. A flag
     * for a human, not an instruction to a payment provider - there is no payment
     * provider here (see V21's header).
     */
    ALTERNATE_METHOD
}
