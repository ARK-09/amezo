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
        assertThat(BuyerOrderGroup.ALL.contains(OrderStatus.PLACED, false)).isTrue();
        assertThat(BuyerOrderGroup.ALL.contains(OrderStatus.DELIVERED, false)).isTrue();

        // IN_PROGRESS is the complement of the terminal statuses.
        assertThat(BuyerOrderGroup.IN_PROGRESS.contains(OrderStatus.PLACED, false)).isTrue();
        assertThat(BuyerOrderGroup.IN_PROGRESS.contains(OrderStatus.SHIPPED, false)).isTrue();
        assertThat(BuyerOrderGroup.IN_PROGRESS.contains(OrderStatus.DELIVERED, false)).isFalse();

        assertThat(BuyerOrderGroup.DELIVERED.contains(OrderStatus.DELIVERED, false)).isTrue();
        assertThat(BuyerOrderGroup.DELIVERED.contains(OrderStatus.SHIPPED, false)).isFalse();

        // REFUNDS is not a fulfilment state at all: it asks the refund domain,
        // and until one exists every order answers false.
        assertThat(BuyerOrderGroup.REFUNDS.contains(OrderStatus.DELIVERED, false)).isFalse();
        assertThat(BuyerOrderGroup.REFUNDS.contains(OrderStatus.DELIVERED, true)).isTrue();
        assertThat(BuyerOrderGroup.REFUNDS.contains(OrderStatus.PLACED, true)).isTrue();
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
            assertThat(BuyerOrderGroup.IN_PROGRESS.contains(status, false))
                    .as("IN_PROGRESS should %s %s", terminal ? "exclude" : "include", status)
                    .isEqualTo(!terminal);
        }
    }

    // -----------------------------------------------------------------
    // Periods.
    // -----------------------------------------------------------------

    @Test
    void periodsParseFromTheTokensTheClientsSelectOffers() {
        assertThat(BuyerOrderPeriod.from("all")).isEqualTo(BuyerOrderPeriod.ALL);
        assertThat(BuyerOrderPeriod.from("30d")).isEqualTo(BuyerOrderPeriod.PAST_30_DAYS);
        assertThat(BuyerOrderPeriod.from("6m")).isEqualTo(BuyerOrderPeriod.PAST_6_MONTHS);
        assertThat(BuyerOrderPeriod.from("12m")).isEqualTo(BuyerOrderPeriod.PAST_12_MONTHS);
        assertThat(BuyerOrderPeriod.from(null)).isEqualTo(BuyerOrderPeriod.ALL);
        assertThat(BuyerOrderPeriod.from("")).isEqualTo(BuyerOrderPeriod.ALL);
    }

    @Test
    void anUnknownPeriodIs422RatherThanQuietlyCountingAllTime() {
        assertThatThrownBy(() -> BuyerOrderPeriod.from("90d"))
                .isInstanceOf(UnprocessableEntityException.class)
                .satisfies(thrown -> assertThat(((UnprocessableEntityException) thrown).getErrors())
                        .singleElement()
                        .extracting(UnprocessableEntityException.FieldError::field)
                        .isEqualTo("period"));
    }

    /**
     * The day counts have to match MyOrders.tsx exactly - 30 / 183 / 365 - or a
     * tab reads "3" and opens a list of two.
     */
    @Test
    void periodStartsMatchTheDayCountsTheClientUses() {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        assertThat(BuyerOrderPeriod.ALL.startDate()).isNull();
        assertThat(BuyerOrderPeriod.PAST_30_DAYS.startDate()).isEqualTo(today.minusDays(30));
        assertThat(BuyerOrderPeriod.PAST_6_MONTHS.startDate()).isEqualTo(today.minusDays(183));
        assertThat(BuyerOrderPeriod.PAST_12_MONTHS.startDate()).isEqualTo(today.minusDays(365));
    }
}
