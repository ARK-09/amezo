package com.arkindustries.amezo.orders.dto;

/**
 * A category as the metrics endpoints print one (fixture.yaml: Category) - the
 * stable slug plus the display name, so nothing has to load the category list
 * to turn one into the other.
 *
 * Declared here rather than reused from catalog.dto.CategoryResponse: a
 * feature's dto package is not its api package, and orders may not import it
 * (PackageBoundaryTest). The two records are deliberately identical on the wire.
 */
public record MetricCategoryResponse(
        String slug,
        String name
) {
}
