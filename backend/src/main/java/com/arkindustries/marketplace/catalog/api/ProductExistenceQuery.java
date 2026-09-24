package com.arkindustries.marketplace.catalog.api;

import java.util.UUID;

/**
 * The only surface other features may depend on for catalog data. Anything
 * outside this package (entities, repositories, ProductService itself) is
 * off-limits to other features - see PackageBoundaryTest.
 */
public interface ProductExistenceQuery {

    boolean exists(UUID productId);
}
