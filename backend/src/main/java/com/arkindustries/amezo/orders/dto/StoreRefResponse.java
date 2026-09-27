package com.arkindustries.amezo.orders.dto;

import java.util.UUID;

/**
 * The contract's StoreRef, as a buyer's order prints it.
 *
 * A response record of its own rather than serialising identity.api.StoreRef
 * straight out: the api record is a cross-feature query result and this one is a
 * wire shape. They happen to have the same three fields today, and the day the
 * contract adds a fourth is not the day identity's query interface should have
 * to change.
 */
public record StoreRefResponse(UUID id, String name, String handle) {
}
