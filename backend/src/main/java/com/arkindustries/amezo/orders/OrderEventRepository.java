package com.arkindustries.amezo.orders;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

interface OrderEventRepository extends JpaRepository<OrderEvent, UUID> {

    /**
     * An order's history, oldest first. Tie-broken by recorded_at so two events
     * backdated to the same instant still come back in the order they were filed.
     */
    List<OrderEvent> findByOrderIdOrderByOccurredAtAscRecordedAtAsc(UUID orderId);
}
