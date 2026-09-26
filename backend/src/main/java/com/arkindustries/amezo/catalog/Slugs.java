package com.arkindustries.amezo.catalog;

import java.text.Normalizer;
import java.util.Locale;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Turns a product title into the URL segment that replaces its id.
 *
 * The rules, and why each one is here:
 *   - Accents are folded, not dropped: "Café Crème" becomes "cafe-creme" rather
 *     than "caf-cr-me". NFKD splits a letter from its diacritic, then the
 *     combining marks are removed.
 *   - Letters NFKD cannot fold are expanded first (EXPANSIONS). A ligature or a
 *     barred letter is its own character rather than a base plus a diacritic, so
 *     normalization leaves it intact and the [a-z0-9] rule then deletes it -
 *     "Æther Œuvre" would become "ther-uvre", silently losing a letter from each
 *     word. Spelling them out gives "aether-oeuvre".
 *   - Everything that isn't [a-z0-9] becomes a single hyphen, so spaces,
 *     punctuation, emoji and CJK all collapse the same way, and no slug ever
 *     needs percent-encoding. A slug that had to be encoded to appear in a URL
 *     would defeat the point of having one.
 *   - Leading and trailing hyphens are trimmed, so "¡Hola!" is "hola", not
 *     "-hola-".
 *   - Capped at MAX_LENGTH, cut back to a hyphen boundary so the last word isn't
 *     sliced in half, leaving room for a de-duplication suffix inside the
 *     column's 255 characters.
 *   - A title with nothing sluggable in it at all (punctuation only, or entirely
 *     CJK) falls back to FALLBACK rather than producing an empty segment. The
 *     uniqueness pass then gives it product-2, product-3, and the product is
 *     still reachable.
 */
public final class Slugs {

    static final int MAX_LENGTH = 200;
    static final String FALLBACK = "product";

    private static final Pattern COMBINING_MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_SLUG = Pattern.compile("[^a-z0-9]+");

    /**
     * Latin letters with no decomposition, in pairs of {character, replacement}.
     * Deliberately only the ones that turn up in product names written in a Latin
     * script - this is a slug generator, not a transliteration library, and scripts
     * it has no mapping for still reach the FALLBACK path and stay reachable.
     */
    private static final String[][] EXPANSIONS = {
            {"æ", "ae"}, {"Æ", "ae"},
            {"œ", "oe"}, {"Œ", "oe"},
            {"ß", "ss"},
            {"ø", "o"}, {"Ø", "o"},
            {"đ", "d"}, {"Đ", "d"}, {"ð", "d"}, {"Ð", "d"},
            {"þ", "th"}, {"Þ", "th"},
            {"ł", "l"}, {"Ł", "l"},
            {"ı", "i"}, {"İ", "i"},
            {"ħ", "h"}, {"Ħ", "h"},
            {"ŋ", "ng"}, {"Ŋ", "ng"},
    };

    private Slugs() {
    }

    public static String slugify(String raw) {
        if (raw == null) {
            return FALLBACK;
        }
        String expanded = expandUnfoldable(raw);
        String folded = COMBINING_MARKS.matcher(Normalizer.normalize(expanded, Normalizer.Form.NFKD)).replaceAll("");
        String hyphenated = NON_SLUG.matcher(folded.toLowerCase(Locale.ROOT)).replaceAll("-");
        String trimmed = trimHyphens(hyphenated);
        if (trimmed.isEmpty()) {
            return FALLBACK;
        }
        return trimHyphens(cut(trimmed));
    }

    /**
     * The slug to store, given a way to ask whether a candidate is already taken.
     * Two sellers listing "Classic Cotton T-Shirt" is ordinary, so the second one
     * becomes classic-cotton-t-shirt-2. Counting up rather than appending a random
     * suffix keeps the URL readable and makes the result reproducible in a test.
     *
     * The caller's predicate is what closes the race: it is a uniqueness check
     * against the database, and the unique index on product.slug is still the
     * final word if two inserts pick the same candidate at once.
     */
    public static String uniqueSlug(String raw, Predicate<String> taken) {
        String base = slugify(raw);
        if (!taken.test(base)) {
            return base;
        }
        for (int suffix = 2; suffix < Integer.MAX_VALUE; suffix++) {
            String candidate = base + "-" + suffix;
            if (!taken.test(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("Could not find a free slug for '" + raw + "'");
    }

    private static String expandUnfoldable(String raw) {
        String expanded = raw;
        for (String[] pair : EXPANSIONS) {
            if (expanded.indexOf(pair[0].charAt(0)) >= 0) {
                expanded = expanded.replace(pair[0], pair[1]);
            }
        }
        return expanded;
    }

    private static String cut(String slug) {
        if (slug.length() <= MAX_LENGTH) {
            return slug;
        }
        String head = slug.substring(0, MAX_LENGTH);
        int lastHyphen = head.lastIndexOf('-');
        // Only cut back to a word boundary if that leaves something substantial;
        // one very long word still yields a hard truncation rather than FALLBACK.
        return lastHyphen > MAX_LENGTH / 2 ? head.substring(0, lastHyphen) : head;
    }

    private static String trimHyphens(String value) {
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
