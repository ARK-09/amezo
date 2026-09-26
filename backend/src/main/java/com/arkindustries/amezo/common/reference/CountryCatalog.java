package com.arkindustries.amezo.common.reference;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The system country list: ISO 3166-1 alpha-2, straight from the JDK's own
 * registry rather than a hand-typed table.
 *
 * Reference data that ships with the code, not a database table like category. The
 * difference is who owns it: categories are a merchandising decision this
 * marketplace makes and changes, while the set of countries is an external
 * standard nobody here gets a vote on. A table would only add a migration to keep
 * in step with the JDK.
 *
 * Built once, at class-init: the list is a few hundred immutable rows and its
 * contents cannot change while the process runs.
 *
 * Locale.getISOCountries returns some codes whose display name the JDK cannot
 * resolve, in which case getDisplayCountry echoes the code back. Those are dropped
 * rather than shown as a bare two-letter code in a selector - anything a buyer
 * cannot recognise is not a usable choice.
 */
public final class CountryCatalog {

    private static final List<Country> COUNTRIES = Stream.of(Locale.getISOCountries())
            .map(code -> new Country(code, Locale.of("", code).getDisplayCountry(Locale.ENGLISH)))
            .filter(country -> !country.name().isBlank() && !country.name().equals(country.code()))
            .sorted(Comparator.comparing(Country::name))
            .toList();

    private static final Map<String, Country> BY_CODE = COUNTRIES.stream()
            .collect(Collectors.toMap(Country::code, Function.identity()));

    private CountryCatalog() {
    }

    /** Every selectable country, ordered by name - the order a selector shows. */
    public static List<Country> all() {
        return COUNTRIES;
    }

    /**
     * Whether a stored/submitted code is one of ours. Null and blank are NOT valid
     * here; @NotBlank reports those, so this method staying strict keeps one field
     * from producing two overlapping messages.
     */
    public static boolean isValidCode(String code) {
        return code != null && BY_CODE.containsKey(code.toUpperCase(Locale.ROOT));
    }
}
