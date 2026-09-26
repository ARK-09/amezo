package com.arkindustries.amezo.common.reference;

/**
 * One selectable country: the ISO 3166-1 alpha-2 code that gets stored, and the
 * English name that gets shown.
 */
public record Country(String code, String name) {
}
