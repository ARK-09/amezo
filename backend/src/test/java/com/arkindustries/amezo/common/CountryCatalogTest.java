package com.arkindustries.amezo.common;

import com.arkindustries.amezo.common.reference.Country;
import com.arkindustries.amezo.common.reference.CountryCatalog;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The country list and its validation. A unit test, because the list is reference
 * data compiled into the application rather than rows in a table.
 */
class CountryCatalogTest {

    @Test
    void containsTheWholeIsoList() {
        // Enough to be the real registry rather than a hand-picked handful.
        assertThat(CountryCatalog.all().size()).isGreaterThan(200);
    }

    @Test
    void everyEntryHasACodeAndAReadableName() {
        assertThat(CountryCatalog.all()).allSatisfy(country -> {
            assertThat(country.code()).hasSize(2).matches("[A-Z]{2}");
            assertThat(country.name()).isNotBlank();
            // A name that is just the code back again is the JDK saying it can't
            // resolve one; those are filtered out, since a bare "ZZ" is not a
            // choice anyone can recognise in a selector.
            assertThat(country.name()).isNotEqualTo(country.code());
        });
    }

    /** Sorted by name, because that is the order a selector shows them in. */
    @Test
    void isOrderedByName() {
        List<String> names = CountryCatalog.all().stream().map(Country::name).toList();
        assertThat(names).isSorted();
    }

    @Test
    void acceptsRealCodes() {
        assertThat(CountryCatalog.isValidCode("US")).isTrue();
        assertThat(CountryCatalog.isValidCode("GB")).isTrue();
        assertThat(CountryCatalog.isValidCode("AE")).isTrue();
        assertThat(CountryCatalog.isValidCode("JP")).isTrue();
    }

    /** Lowercase input from a client is still a real country. */
    @Test
    void acceptsCodesInAnyCase() {
        assertThat(CountryCatalog.isValidCode("us")).isTrue();
        assertThat(CountryCatalog.isValidCode("gB")).isTrue();
    }

    /**
     * "UK" is the trap worth a test of its own: it reads like a country code, it is
     * what people type, and the ISO code is GB.
     */
    @Test
    void rejectsPlausibleButWrongCodes() {
        assertThat(CountryCatalog.isValidCode("UK")).isFalse();
        assertThat(CountryCatalog.isValidCode("XX")).isFalse();
        assertThat(CountryCatalog.isValidCode("USA")).isFalse();
        assertThat(CountryCatalog.isValidCode("U")).isFalse();
    }

    @Test
    void rejectsNothing() {
        assertThat(CountryCatalog.isValidCode(null)).isFalse();
        assertThat(CountryCatalog.isValidCode("")).isFalse();
        assertThat(CountryCatalog.isValidCode("  ")).isFalse();
    }
}
