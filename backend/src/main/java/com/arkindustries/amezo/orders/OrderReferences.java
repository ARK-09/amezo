package com.arkindustries.amezo.orders;

import java.util.Locale;
import java.util.UUID;

/**
 * The short human reference a buyer's order card prints: "ord_19ff4c82".
 *
 * Derived from the order's id rather than stored in a column of its own. There
 * is nothing for a second column to hold that the primary key does not already
 * say, a stored copy is one more thing that can disagree with the row it names,
 * and a sequence would need a migration plus a backfill to produce a value that
 * is no more useful than this one.
 *
 * The consequence, and the reason this is a class and not an inline
 * String.format: the reference is a PREFIX OF THE ID, so searching for one is a
 * prefix match against the id rather than an equality test against a column.
 * Both halves of that live here, so the format cannot change on one side only.
 */
final class OrderReferences {

    private static final String PREFIX = "ord_";

    /** Eight hex digits, which is the first group of a UUID's canonical form. */
    private static final int SIGNIFICANT_CHARS = 8;

    private OrderReferences() {
    }

    static String of(UUID orderId) {
        return PREFIX + orderId.toString().substring(0, SIGNIFICANT_CHARS);
    }

    /**
     * Whether a search term matches this order's reference.
     *
     * Substring, not prefix, and case-insensitive: a buyer pasting "19ff4c82"
     * out of an email, typing "ord_19ff" from memory, or searching the whole
     * "ord_19ff4c82" all mean the same order, and a marketplace search box that
     * only honoured one of the three would look broken.
     */
    static boolean matches(UUID orderId, String lowercaseTerm) {
        return of(orderId).toLowerCase(Locale.ROOT).contains(lowercaseTerm);
    }
}
