package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.common.exception.UnprocessableEntityException;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The parsing and predicate rules behind GET /api/v1/orders' query parameters.
 *
 * No Spring context and no database, so these run wherever the compiler does -
 * which matters because the rules they cover are the ones an integration test
 * would only prove one value of at a time.
 */
class BuyerOrderFiltersTest {

    // -----------------------------------------------------------------
    // References.
    // -----------------------------------------------------------------

    @Test
    void aReferenceIsOrdPlusTheFirstEightHexDigitsOfTheId() {
        UUID id = UUID.fromString("19ff4c82-1111-2222-3333-444444444444");
        assertThat(OrderReferences.of(id)).isEqualTo("ord_19ff4c82");
    }

    @Test
    void referenceSearchMatchesWholePartAndEitherCase() {
        UUID id = UUID.fromString("19ff4c82-1111-2222-3333-444444444444");

        assertThat(OrderReferences.matches(id, "ord_19ff4c82")).isTrue();
        assertThat(OrderReferences.matches(id, "19ff4c82")).isTrue();
        assertThat(OrderReferences.matches(id, "19ff")).isTrue();
        assertThat(OrderReferences.matches(id, "ord_")).isTrue();
        // Callers lowercase the term before calling, which is what makes the
        // search case-insensitive without this method guessing.
        assertThat(OrderReferences.matches(id, "ORD_19FF4C82".toLowerCase(java.util.Locale.ROOT))).isTrue();

        // The fifth hex group is NOT part of the reference, so it must not match.
        assertThat(OrderReferences.matches(id, "444444")).isFalse();
        assertThat(OrderReferences.matches(id, "deadbeef")).isFalse();
    }

    // -----------------------------------------------------------------
    // Groups.
    // -----------------------------------------------------------------

    @Test
    void groupsParseFromTheWireSpellingTheTabsUse() {
        assertThat(BuyerOrderGroup.from("all")).isEqualTo(BuyerOrderGroup.ALL);
        assertThat(BuyerOrderGroup.from("in_progress")).isEqualTo(BuyerOrderGroup.IN_PROGRESS);
        assertThat(BuyerOrderGroup.from("delivered")).isEqualTo(BuyerOrderGroup.DELIVERED);
        assertThat(BuyerOrderGroup.from("refunds")).isEqualTo(BuyerOrderGroup.REFUNDS);
        // Case and surrounding space are the client's business, not a 422.
        assertThat(BuyerOrderGroup.from(" IN_PROGRESS ")).isEqualTo(BuyerOrderGroup.IN_PROGRESS);
    }

    @Test
    void anAbsentGroupIsAllSoTheUnNarrowedCountsStayReachable() {
        assertThat(BuyerOrderGroup.from(null)).isEqualTo(BuyerOrderGroup.ALL);
        assertThat(BuyerOrderGroup.from("")).isEqualTo(BuyerOrderGroup.ALL);
        assertThat(BuyerOrderGroup.from("   ")).isEqualTo(BuyerOrderGroup.ALL);
    }

    @Test
    void anUnknownGroupIs422NamingTheFieldRatherThanASilentFallbackToAll() {
        assertThatThrownBy(() -> BuyerOrderGroup.from("in-progress"))
                .isInstanceOf(UnprocessableEntityException.class)
                .satisfies(thrown -> assertThat(((UnprocessableEntityException) thrown).getErrors())
                        .singleElement()
                        .extracting(UnprocessableEntityException.FieldError::field)
                        .isEqualTo("group"));
    }

    @Test
    void everyBucketMeansWhatItsTabSays() {
        // ALL is everything, including the terminal states.
        assertThat(BuyerOrderGroup.ALL.contains(name(OrderStatus.PLACED), false)).isTrue();
        assertThat(BuyerOrderGroup.ALL.contains(name(OrderStatus.DELIVERED), false)).isTrue();

        // IN_PROGRESS is the complement of the terminal statuses.
        assertThat(BuyerOrderGroup.IN_PROGRESS.contains(name(OrderStatus.PLACED), false)).isTrue();
        assertThat(BuyerOrderGroup.IN_PROGRESS.contains(name(OrderStatus.SHIPPED), false)).isTrue();
        assertThat(BuyerOrderGroup.IN_PROGRESS.contains(name(OrderStatus.DELIVERED), false)).isFalse();

        assertThat(BuyerOrderGroup.DELIVERED.contains(name(OrderStatus.DELIVERED), false)).isTrue();
        assertThat(BuyerOrderGroup.DELIVERED.contains(name(OrderStatus.SHIPPED), false)).isFalse();

        // REFUNDS is not a fulfilment state at all: it asks whether the order has any
        // refund request against it, whatever became of that request.
        assertThat(BuyerOrderGroup.REFUNDS.contains(name(OrderStatus.DELIVERED), false)).isFalse();
        assertThat(BuyerOrderGroup.REFUNDS.contains(name(OrderStatus.DELIVERED), true)).isTrue();
        assertThat(BuyerOrderGroup.REFUNDS.contains(name(OrderStatus.PLACED), true)).isTrue();
    }

    /**
     * The derived status the predicate actually receives, which OrderStatus cannot
     * hold: REFUNDED is derived from a settled refund request and never stored, so a
     * refunded order reaches these buckets as a String the enum has no constant for.
     */
    @Test
    void aRefundedOrderIsTerminalAndStaysInTheRefundsTab() {
        String refunded = OrderStatus.DERIVED_REFUNDED;

        assertThat(BuyerOrderGroup.ALL.contains(refunded, true)).isTrue();
        // Not "in progress": the money has gone back, nothing is pending.
        assertThat(BuyerOrderGroup.IN_PROGRESS.contains(refunded, true)).isFalse();
        // Not "delivered" either - REFUNDED is what that order is now, which is the
        // same answer the seller's own list gives for it.
        assertThat(BuyerOrderGroup.DELIVERED.contains(refunded, true)).isFalse();
        // And it is still findable where a buyer would look for it. A settled refund
        // leaving this tab at the moment it was paid out would hide it exactly when
        // they came to check what happened.
        assertThat(BuyerOrderGroup.REFUNDS.contains(refunded, true)).isTrue();
    }

    @Test
    void theTabsAreEveryBucketInTabOrder() {
        assertThat(BuyerOrderGroup.tabs())
                .extracting(BuyerOrderGroup::wireValue)
                .containsExactly("all", "in_progress", "delivered", "refunds");
    }

    /**
     * The guard on the one thing about this enum that is not obvious. IN_PROGRESS
     * is defined by NAME against a set that already lists CANCELLED and REFUNDED,
     * so when OrderStatus gains either of them a cancelled order leaves the "In
     * progress" tab without anybody editing BuyerOrderGroup - which is the whole
     * point, and would otherwise be a silently wrong count.
     */
    @Test
    void inProgressExcludesEveryTerminalStatusTheEnumHasToday() {
        for (OrderStatus status : OrderStatus.values()) {
            boolean terminal = status.name().equals("DELIVERED")
                    || status.name().equals("CANCELLED")
                    || status.name().equals("REFUNDED");
            assertThat(BuyerOrderGroup.IN_PROGRESS.contains(name(status), false))
                    .as("IN_PROGRESS should %s %s", terminal ? "exclude" : "include", status)
                    .isEqualTo(!terminal);
        }
    }

    /** The buckets take the DERIVED status, as a String - see BuyerOrderGroup.contains. */
    private static String name(OrderStatus status) {
        return status.name();
    }
}
