package com.arkindustries.amezo.refunds;

import com.arkindustries.amezo.refunds.api.RefundWindowPolicy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * The return window, in one place. See {@link RefundWindowPolicy} for why it is
 * exposed cross-feature and for the flagged consequence of anchoring it to the
 * order date rather than the delivery date, which this schema does not record.
 *
 * Configurable rather than a constant because the length is a business policy, not
 * a fact about the code, and 30 days is what the design's own decline reason
 * ("Outside the 30-day return window") states.
 */
@Component
class RefundWindow implements RefundWindowPolicy {

    private final Duration length;

    RefundWindow(@Value("${app.refunds.return-window-days:30}") long days) {
        this.length = Duration.ofDays(days);
    }

    @Override
    public Instant endsAt(Instant orderPlacedAt) {
        return orderPlacedAt.plus(length);
    }

    @Override
    public boolean isOpenAt(Instant orderPlacedAt, Instant now) {
        // Not isAfter: a request landing on the exact boundary instant is inside
        // the window, which is the reading a buyer would expect of "30 days".
        return !now.isAfter(endsAt(orderPlacedAt));
    }
}
