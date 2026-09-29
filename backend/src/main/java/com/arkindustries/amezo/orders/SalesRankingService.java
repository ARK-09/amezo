package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.api.ProductSalesQuery;
import com.arkindustries.amezo.orders.api.SellerSalesQuery;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Orders' answer to "what sells" and "who sells it". See {@link ProductSalesQuery}
 * for why the rankings are computed here and published as ids rather than joined in
 * whichever feature needs to render them.
 *
 * Package-private: the callers depend on the interfaces.
 */
@Service
class SalesRankingService implements ProductSalesQuery, SellerSalesQuery {

    private final SalesRankingRepository sales;

    SalesRankingService(SalesRankingRepository sales) {
        this.sales = sales;
    }

    @Override
    @Transactional(readOnly = true)
    public List<UUID> bestSellingProductIds(Instant since, int limit) {
        if (limit < 1) {
            return List.of();
        }
        return sales.bestSellingProductIds(since, limit);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UUID> bestSellingAmong(Collection<UUID> productIds, Instant since, int limit) {
        // Guarded rather than passed through: an empty IN (...) list is a SQL syntax
        // error on Postgres, and "rank nothing" has an obvious answer.
        if (productIds.isEmpty() || limit < 1) {
            return List.of();
        }
        return sales.bestSellingAmong(productIds, since, limit);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UUID> bestSellingSellerIds(Instant since, int limit) {
        if (limit < 1) {
            return List.of();
        }
        return sales.bestSellingSellerIds(since, limit);
    }
}
