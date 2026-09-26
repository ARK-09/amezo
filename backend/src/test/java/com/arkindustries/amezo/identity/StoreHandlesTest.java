package com.arkindustries.amezo.identity;

import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Store handle derivation, in a plain unit test - no Spring, no Postgres. This
 * decides what a brand-new storefront's URL looks like, and it runs without a
 * Docker daemon, which the integration suite needs.
 *
 * Every case here also asserts the result satisfies StoreHandle's own pattern,
 * because a derived handle that the contract would reject is a store whose URL
 * the seller can never save again.
 */
class StoreHandlesTest {

    private static final Pattern CONTRACT = Pattern.compile(StoreHandles.PATTERN);

    @Test
    void lowercasesAndHyphenatesWords() {
        assertThat(handle("Northwind Supply")).isEqualTo("northwind-supply");
    }

    @Test
    void collapsesRunsOfPunctuationIntoOneDash() {
        assertThat(handle("Ada's  Bits & Bobs!")).isEqualTo("ada-s-bits-bobs");
    }

    /** The common case: seller.full_name is null, so the email local part is what is left. */
    @Test
    void derivesFromAnEmailLocalPart() {
        assertThat(handle("ada.lovelace09")).isEqualTo("ada-lovelace09");
    }

    /** Never a leading or trailing dash - the printed URL must not end in one. */
    @Test
    void trimsDashesFromBothEnds() {
        assertThat(handle("  -- Hello --  ")).isEqualTo("hello");
        assertThat(handle("!!!Bits!!!")).isEqualTo("bits");
    }

    /** minLength is 2, so a one-character result is extended rather than emitted. */
    @Test
    void extendsAResultShorterThanTheMinimum() {
        assertThat(handle("a")).isEqualTo("a-store");
        assertThat(handle("7@example.com")).isEqualTo("7-example-com");
    }

    /** Nothing sluggable at all still has to produce a reachable URL. */
    @Test
    void fallsBackWhenThereIsNothingToDeriveFrom() {
        assertThat(handle("???")).isEqualTo("store");
        assertThat(handle("")).isEqualTo("store");
        assertThat(handle(null)).isEqualTo("store");
    }

    @Test
    void capsAtTheContractsMaxLength() {
        String derived = handle("a".repeat(120));
        assertThat(derived).hasSize(StoreHandles.MAX_LENGTH);
    }

    @Test
    void countsUpWhenTheHandleIsTaken() {
        Set<String> taken = Set.of("northwind-supply", "northwind-supply-2");
        assertThat(StoreHandles.unique("Northwind Supply", taken::contains))
                .isEqualTo("northwind-supply-3");
    }

    /**
     * The de-duplication suffix has to fit INSIDE maxLength, and the cut that
     * makes room for it must not leave a trailing dash behind.
     */
    @Test
    void makesRoomForTheSuffixWithinTheMaxLength() {
        String longName = "a".repeat(38) + "-b";
        String unique = StoreHandles.unique(longName, candidate -> candidate.equals(StoreHandles.from(longName)));

        assertThat(unique).hasSizeLessThanOrEqualTo(StoreHandles.MAX_LENGTH);
        assertThat(unique).endsWith("-2");
        assertThat(CONTRACT.matcher(unique).matches()).isTrue();
    }

    @Test
    void everyDerivedHandleSatisfiesTheContractsPattern() {
        for (String raw : new String[]{
                "Northwind Supply", "a", "???", "", "Ada's Bits & Bobs!", "café crème",
                "ada.lovelace09@example.com", "-".repeat(50), "A".repeat(120), "商店"}) {
            String derived = StoreHandles.from(raw);
            assertThat(CONTRACT.matcher(derived).matches())
                    .as("'%s' derived '%s'", raw, derived)
                    .isTrue();
        }
    }

    private static String handle(String raw) {
        String derived = StoreHandles.from(raw);
        assertThat(CONTRACT.matcher(derived).matches())
                .as("'%s' derived '%s', which StoreHandle would reject", raw, derived)
                .isTrue();
        return derived;
    }
}
