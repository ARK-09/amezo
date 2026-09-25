package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.orders.api.OfferOrderHistoryQuery;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.UUID;

@Service
class OfferOrderHistoryService implements OfferOrderHistoryQuery {

    private final OrderLineRepository orderLineRepository;

    OfferOrderHistoryService(OrderLineRepository orderLineRepository) {
        this.orderLineRepository = orderLineRepository;
    }

    @Override
    public boolean anySoldOffer(Collection<UUID> offerIds) {
        return !offerIds.isEmpty() && orderLineRepository.existsByOfferIdIn(offerIds);
    }
}
