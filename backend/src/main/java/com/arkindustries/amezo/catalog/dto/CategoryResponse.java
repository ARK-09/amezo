package com.arkindustries.amezo.catalog.dto;

/**
 * How a category crosses the wire, everywhere: on its own from GET /categories,
 * and nested inside every product response. Both fields travel together so a
 * screen showing a category never needs a second request to turn a slug into a
 * name - and so a link or a filter never has to guess which one is the stable
 * value.
 */
public record CategoryResponse(
        String slug,
        String name
) {
}
