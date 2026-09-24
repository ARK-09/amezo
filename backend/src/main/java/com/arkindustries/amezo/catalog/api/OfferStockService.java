package com.arkindustries.amezo.catalog.api;

import java.util.UUID;

public interface OfferStockService {

    /**
     * Conditional decrement (WHERE stock_qty >= quantity). Returns true if
     * it matched a row (stock was sufficient and was decremented), false
     * if not - the caller decides what "false" means (abort the whole
     * order, roll back the transaction).
     */
    boolean decrementStock(UUID offerId, int quantity);
}
