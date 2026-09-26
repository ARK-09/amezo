package com.arkindustries.amezo.identity;

import java.util.Locale;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * The StoreHandle rule from the API contract, in one place: the regex the
 * request DTO validates against, and the derivation that gives a brand-new
 * store a handle nobody typed.
 *
 * It is NOT catalog's Slugs. That produces a product slug - up to 200
 * characters, any shape, de-duplicated against product.slug - and it lives in
 * another feature, which PackageBoundaryTest forbids identity from importing.
 * A store handle answers to a different, tighter rule that the contract spells
 * out and a printed URL depends on:
 *   - lowercase letters, digits and inner dashes only;
 *   - never a leading or trailing dash, so amezo.com/stores/{handle} never
 *     ends in one;
 *   - 2 to 39 characters.
 */
public final class StoreHandles {

    /**
     * StoreHandle.pattern, character for character. A compile-time constant so
     * UpdateStoreProfileRequest can put it straight in its @Pattern, and V18's
     * CHECK constraint repeats it for the database.
     */
    public static final String PATTERN = "^[a-z0-9][a-z0-9-]{0,37}[a-z0-9]$";

    /** StoreHandle.maxLength, and seller_store.handle's column width. */
    public static final int MAX_LENGTH = 39;

    /** StoreHandle.minLength. A one-character handle is not a handle. */
    public static final int MIN_LENGTH = 2;

    /**
     * What a seller whose name slugs to nothing at all gets - an address made
     * only of punctuation, or one written in a script this has no mapping for.
     * The de-duplication pass then makes it store-2, store-3, and the
     * storefront is still reachable. The seller renames it in Store Settings.
     */
    static final String FALLBACK = "store";

    private static final Pattern NON_HANDLE = Pattern.compile("[^a-z0-9]+");

    private StoreHandles() {
    }

    /**
     * A handle-shaped candidate derived from arbitrary text.
     *
     * Everything outside [a-z0-9] collapses to a single dash, the ends are
     * trimmed, and the result is cut to MAX_LENGTH. A result shorter than
     * MIN_LENGTH is extended rather than discarded - a seller reachable only as
     * "a" keeps their letter and becomes "a-store", which is still theirs.
     */
    public static String from(String raw) {
        if (raw == null) {
            return FALLBACK;
        }
        String hyphenated = NON_HANDLE.matcher(raw.toLowerCase(Locale.ROOT)).replaceAll("-");
        String base = trimDashes(cut(trimDashes(hyphenated), MAX_LENGTH));
        if (base.isEmpty()) {
            return FALLBACK;
        }
        if (base.length() < MIN_LENGTH) {
            return base + "-" + FALLBACK;
        }
        return base;
    }

    /**
     * The handle to store, given a way to ask whether a candidate is taken.
     * Counting up rather than appending random characters keeps the URL
     * readable and makes the result reproducible in a test.
     *
     * The caller's predicate is a uniqueness check against the database, so it
     * narrows the window but does not close it; seller_store.handle's UNIQUE
     * index is still the final word, and SellerStoreService.requireStore
     * handles losing that race.
     */
    public static String unique(String raw, Predicate<String> taken) {
        String base = from(raw);
        if (!taken.test(base)) {
            return base;
        }
        for (int suffix = 2; suffix < Integer.MAX_VALUE; suffix++) {
            String tail = "-" + suffix;
            // The suffix has to fit inside MAX_LENGTH, so the base is cut back
            // further to make room - and re-trimmed, because that cut can land
            // on a dash and a trailing dash is exactly what the pattern forbids.
            String head = trimDashes(cut(base, MAX_LENGTH - tail.length()));
            String candidate = head.isEmpty() ? FALLBACK + tail : head + tail;
            if (!taken.test(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("Could not find a free store handle for '" + raw + "'");
    }

    private static String cut(String value, int max) {
        return value.length() <= max ? value : value.substring(0, Math.max(max, 0));
    }

    private static String trimDashes(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && value.charAt(start) == '-') {
            start++;
        }
        while (end > start && value.charAt(end - 1) == '-') {
            end--;
        }
        return value.substring(start, end);
    }
}
