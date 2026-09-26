package com.arkindustries.amezo.orders;

import com.arkindustries.amezo.catalog.api.ProductCatalogSummary;
import com.arkindustries.amezo.catalog.api.ProductCatalogSummaryQuery;
import com.arkindustries.amezo.identity.api.CurrentSeller;
import com.arkindustries.amezo.orders.dto.CategoryShareResponse;
import com.arkindustries.amezo.orders.dto.MetricCategoryResponse;
import com.arkindustries.amezo.orders.dto.MetricPointResponse;
import com.arkindustries.amezo.orders.dto.MetricTotalsResponse;
import com.arkindustries.amezo.orders.dto.SellerMetricsResponse;
import com.arkindustries.amezo.orders.dto.TopProductResponse;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The seller dashboard's numbers: totals and a series for a window, the
 * window's best-selling products, and the split of its revenue by category.
 *
 * Hosted in `orders` rather than in a `metrics` feature of its own, on purpose.
 * The fact table is order_line - orders' own entity - and every figure here is
 * an aggregate of it. A separate feature would have had to import that data
 * through a new orders.api surface exposing line-level money, which is a far
 * wider export than the one narrow read it actually needs from elsewhere: a
 * product's title, slug and category. That read goes the other way, through
 * catalog.api.ProductCatalogSummaryQuery, exactly as SellerOrderService already
 * reaches catalog for line-item titles. Same boundary, same direction, one new
 * interface instead of two.
 *
 * Ownership is per LINE. orders.seller_id was relaxed to nullable in V12 and
 * checkout stopped setting it, so a real order has seller_id IS NULL and one
 * order can hold several sellers' lines - see SellerOrderService's class
 * comment. Everything below scopes on order_line.seller_id_snapshot, and
 * nothing joins to orders at all.
 *
 * Windows are UTC calendar days, half-open: [from 00:00Z, to+1d 00:00Z). A sale
 * at 23:59:59 on `to` is in; the first instant of the day after `to` is out.
 * The previous window is the equal-length span ending where this one starts,
 * so the two are contiguous and never overlap.
 *
 * Two things this endpoint cannot answer, and does not pretend to:
 *  - views and conversionRate. No view, impression or visit is recorded
 *    anywhere in this schema. Both are null. See MetricTotalsResponse.
 *  - currency. No price column carries one. "USD" is a documented constant.
 */
@Service
public class SellerMetricsService {

    /**
     * Not read from anything. Every money column in this schema is a bare
     * NUMERIC(10,2) with no currency beside it, and the frontend's formatPrice()
     * is fixed to USD to match. Stated here once, as a constant, so the day
     * money becomes multi-currency there is exactly one place that is wrong.
     */
    private static final String CURRENCY = "USD";

    /** The contract's default when ?limit is absent. */
    static final int DEFAULT_TOP_PRODUCTS = 5;

    /**
     * A bound on ?limit, not a page size. The panel this feeds shows five rows;
     * anything past a couple of dozen is a client asking for the whole catalogue
     * through a chart endpoint, and the product list is the right tool for that.
     */
    static final int MAX_TOP_PRODUCTS = 50;

    /** Money keeps the two decimals the columns are stored with. */
    private static final int MONEY_SCALE = 2;

    /**
     * Shares are fractions of one, and the dashboard prints them as whole
     * percentages. Six places is far past what any caller renders, which is the
     * point: rounding is the caller's decision, not something baked in here.
     */
    private static final int SHARE_SCALE = 6;

    private final SellerMetricsRepository metrics;
    private final ProductCatalogSummaryQuery productSummaries;
    private final CurrentSeller currentSeller;

    public SellerMetricsService(
            SellerMetricsRepository metrics,
            ProductCatalogSummaryQuery productSummaries,
            CurrentSeller currentSeller) {
        this.metrics = metrics;
        this.productSummaries = productSummaries;
        this.currentSeller = currentSeller;
    }

    public SellerMetricsResponse metrics(LocalDate from, LocalDate to, String interval) {
        UUID sellerId = currentSeller.sellerId();
        Window window = Window.of(from, to);
        Bucket bucket = Bucket.parse(interval);

        SellerMetricsRepository.WindowTotals current =
                metrics.windowTotals(sellerId, window.start(), window.endExclusive());
        SellerMetricsRepository.WindowTotals previous =
                metrics.windowTotals(sellerId, window.previousStart(), window.start());

        List<MetricPointResponse> series = series(sellerId, window, bucket);

        return new SellerMetricsResponse(
                from.toString(),
                to.toString(),
                CURRENCY,
                totals(current),
                // Null, never a zeroed MetricTotals. No line at all in that span
                // means nothing was measured there, and order_line cannot tell a
                // quiet month apart from a month before this seller existed.
                // Saying "0" would be reporting a measurement nobody took; the
                // dashboard renders the two differently on purpose.
                previous.getLineCount() == 0 ? null : totals(previous),
                series);
    }

    public List<TopProductResponse> topProducts(LocalDate from, LocalDate to, Integer limit) {
        UUID sellerId = currentSeller.sellerId();
        Window window = Window.of(from, to);
        int capped = Math.clamp(limit == null ? DEFAULT_TOP_PRODUCTS : limit, 1, MAX_TOP_PRODUCTS);

        List<SellerMetricsRepository.RankedProduct> ranked = metrics.topProducts(
                sellerId, window.start(), window.endExclusive(), window.previousStart(), capped);
        if (ranked.isEmpty()) {
            return List.of();
        }

        // The denominator is the whole window, not the rows above - see
        // TopProductResponse.share.
        BigDecimal windowRevenue = orZero(
                metrics.windowTotals(sellerId, window.start(), window.endExclusive()).getRevenue());

        Map<UUID, ProductCatalogSummary> summaries = productSummaries.summariesByIds(
                ranked.stream().map(SellerMetricsRepository.RankedProduct::getProductId).toList());

        return ranked.stream()
                .map(row -> {
                    ProductCatalogSummary summary = summaries.get(row.getProductId());
                    BigDecimal revenue = money(orZero(row.getRevenue()));
                    return new TopProductResponse(
                            row.getProductId(),
                            // A product the catalog no longer has still sold what
                            // it sold, so the row stays. The id works as a
                            // reference wherever the slug would have
                            // (GET /products/{productRef} takes either), so the
                            // link does not break either.
                            summary == null ? row.getProductId().toString() : summary.reference(),
                            summary == null ? "(product removed)" : summary.title(),
                            summary == null ? null : summary.thumbnailUrl(),
                            row.getUnits(),
                            revenue,
                            share(revenue, windowRevenue),
                            // Left exactly as the LEFT JOIN produced it. Null here
                            // is "did not sell in the previous window", which is
                            // not a zero - see the repository.
                            row.getPreviousRevenue() == null ? null : money(row.getPreviousRevenue()));
                })
                .toList();
    }

    public List<CategoryShareResponse> categoryBreakdown(LocalDate from, LocalDate to) {
        UUID sellerId = currentSeller.sellerId();
        Window window = Window.of(from, to);

        List<SellerMetricsRepository.ProductTotals> rows =
                metrics.productTotals(sellerId, window.start(), window.endExclusive());
        if (rows.isEmpty()) {
            return List.of();
        }

        // Summed from the same rows rather than asked for again: these are every
        // line in the window, so their total IS the window's revenue.
        BigDecimal windowRevenue = rows.stream()
                .map(row -> orZero(row.getRevenue()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<UUID, ProductCatalogSummary> summaries = productSummaries.summariesByIds(
                rows.stream().map(SellerMetricsRepository.ProductTotals::getProductId).toList());

        // Keyed by slug, the stable machine value - the display name can be
        // edited and two categories must never merge because someone renamed one.
        Map<String, Aggregate> byCategory = new LinkedHashMap<>();
        for (SellerMetricsRepository.ProductTotals row : rows) {
            ProductCatalogSummary summary = summaries.get(row.getProductId());
            // A product the catalog no longer knows has no category to file its
            // revenue under. Left out rather than swept into an invented
            // "Uncategorised" slice - the shares then simply do not close, which
            // is the truth. See CategoryShareResponse.
            if (summary == null || summary.categorySlug() == null) {
                continue;
            }
            byCategory
                    .computeIfAbsent(summary.categorySlug(), slug -> new Aggregate(summary.categoryName()))
                    .add(orZero(row.getRevenue()), row.getUnits());
        }

        return byCategory.entrySet().stream()
                // Revenue first, because that is what a part-to-whole chart is
                // read by; slug to break ties, so two equal categories keep a
                // stable order between calls.
                .sorted(Comparator
                        .comparing((Map.Entry<String, Aggregate> entry) -> entry.getValue().revenue)
                        .reversed()
                        .thenComparing(Map.Entry::getKey))
                .map(entry -> new CategoryShareResponse(
                        new MetricCategoryResponse(entry.getKey(), entry.getValue().name),
                        money(entry.getValue().revenue),
                        entry.getValue().units,
                        share(entry.getValue().revenue, windowRevenue)))
                .toList();
    }

    private List<MetricPointResponse> series(UUID sellerId, Window window, Bucket bucket) {
        if (window.days() == 0) {
            return List.of();
        }

        Map<String, SellerMetricsRepository.SeriesPoint> measured =
                metrics.series(sellerId, window.start(), window.endExclusive(), bucket.unit()).stream()
                        .collect(Collectors.toMap(
                                SellerMetricsRepository.SeriesPoint::getBucket,
                                Function.identity()));

        // Every bucket in the window, not only the ones with sales. A chart drawn
        // from the measured rows alone would join Monday straight to Friday and
        // silently narrow a quiet week into a busy-looking one.
        List<MetricPointResponse> points = new ArrayList<>();
        for (LocalDate start : bucket.startsWithin(window.from(), window.to())) {
            SellerMetricsRepository.SeriesPoint row = measured.get(start.toString());
            points.add(new MetricPointResponse(
                    start.toString(),
                    // views: nothing records one. See MetricTotalsResponse.
                    null,
                    row == null ? 0L : row.getOrderCount(),
                    money(row == null ? BigDecimal.ZERO : orZero(row.getRevenue()))));
        }
        return points;
    }

    private MetricTotalsResponse totals(SellerMetricsRepository.WindowTotals row) {
        BigDecimal revenue = money(orZero(row.getRevenue()));
        long orders = row.getOrderCount();
        return new MetricTotalsResponse(
                // views and conversionRate: nothing in this schema records a
                // view, so neither can be computed. Null, not zero, not a guess.
                null,
                orders,
                revenue,
                null,
                orders == 0
                        ? money(BigDecimal.ZERO)
                        : revenue.divide(BigDecimal.valueOf(orders), MONEY_SCALE, RoundingMode.HALF_UP));
    }

    private static BigDecimal share(BigDecimal part, BigDecimal whole) {
        if (whole == null || whole.signum() == 0) {
            return BigDecimal.ZERO.setScale(SHARE_SCALE);
        }
        return part.divide(whole, SHARE_SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal money(BigDecimal amount) {
        return amount.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }

    /** SUM over no rows is null in SQL. Zero is only ever substituted here, where
     *  the window being reported on is the one that was asked for - never for the
     *  previous window's totals or a product's previous revenue, where the absence
     *  is the answer. */
    private static BigDecimal orZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static final class Aggregate {
        private final String name;
        private BigDecimal revenue = BigDecimal.ZERO;
        private long units;

        private Aggregate(String name) {
            this.name = name;
        }

        private void add(BigDecimal moreRevenue, long moreUnits) {
            revenue = revenue.add(moreRevenue);
            units += moreUnits;
        }
    }

    /**
     * The window asked for, and the equal-length one immediately before it, as
     * the half-open UTC instants the queries take.
     */
    private record Window(LocalDate from, LocalDate to, long days, Instant start, Instant endExclusive,
                          Instant previousStart) {

        static Window of(LocalDate from, LocalDate to) {
            Instant start = from.atStartOfDay(ZoneOffset.UTC).toInstant();
            // to before from is an empty span, not an error: there are no days
            // between them, so there is nothing to report and nothing to compare
            // against. Collapsing it to a zero-length window says that, instead
            // of a negative-length one that would quietly match every row.
            if (to.isBefore(from)) {
                return new Window(from, to, 0, start, start, start);
            }
            long days = ChronoUnit.DAYS.between(from, to) + 1;
            return new Window(
                    from,
                    to,
                    days,
                    start,
                    to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant(),
                    from.minusDays(days).atStartOfDay(ZoneOffset.UTC).toInstant());
        }
    }

    /**
     * How finely the series is cut. The value is passed straight to Postgres'
     * date_trunc, and the same truncation is applied in Java when the empty
     * buckets are filled in, so the two always agree on where a bucket starts.
     *
     * An unrecognised value falls back to DAY rather than failing the request.
     * This parameter chooses a grouping, never which rows are counted, so the
     * finest grouping loses nothing a caller asked for - and the totals beside
     * the series are unaffected either way.
     */
    private enum Bucket {
        DAY("day"),
        WEEK("week"),
        MONTH("month");

        private final String unit;

        Bucket(String unit) {
            this.unit = unit;
        }

        String unit() {
            return unit;
        }

        static Bucket parse(String raw) {
            if (raw == null) {
                return DAY;
            }
            return switch (raw.trim().toLowerCase(Locale.ROOT)) {
                case "week" -> WEEK;
                case "month" -> MONTH;
                default -> DAY;
            };
        }

        /**
         * Every bucket start touched by [from, to], in order.
         *
         * The first one can sit before `from` - a week window starting on a
         * Wednesday belongs to that week's Monday - which is exactly what
         * date_trunc returns for it, so the generated keys match the measured
         * ones.
         */
        List<LocalDate> startsWithin(LocalDate from, LocalDate to) {
            List<LocalDate> starts = new ArrayList<>();
            LocalDate cursor = truncate(from);
            while (!cursor.isAfter(to)) {
                starts.add(cursor);
                cursor = next(cursor);
            }
            return starts;
        }

        private LocalDate truncate(LocalDate date) {
            return switch (this) {
                // Postgres' date_trunc('week') is ISO: weeks start on Monday.
                case WEEK -> date.minusDays(date.getDayOfWeek().getValue() - 1L);
                case MONTH -> date.withDayOfMonth(1);
                case DAY -> date;
            };
        }

        private LocalDate next(LocalDate start) {
            return switch (this) {
                case WEEK -> start.plusWeeks(1);
                case MONTH -> start.plusMonths(1);
                case DAY -> start.plusDays(1);
            };
        }
    }
}
