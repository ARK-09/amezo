package com.arkindustries.amezo.orders.api;

import java.util.Collection;
import java.util.UUID;

/**
 * Orders' answer to one question catalog has to ask before deleting anything:
 * has this offer ever been bought? order_line.offer_id is a real foreign key
 * (deliberately - it's the traceability link back to the live offer), so
 * deleting a sold offer is a constraint violation, and a seller pressing Delete
 * deserves a plain 409 rather than a 500.
 *
 * An api-package interface rather than catalog importing OrderLineRepository:
 * features only ever see each other through these, and PackageBoundaryTest
 * fails the build otherwise.
 */
public interface OfferOrderHistoryQuery {

    boolean anySoldOffer(Collection<UUID> offerIds);
}
