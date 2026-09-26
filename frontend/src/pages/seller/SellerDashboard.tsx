import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useSellerCategoryBreakdown,
  useSellerMetrics,
  useSellerTopProducts,
  type MetricsRange,
} from '@/features/seller-metrics/api/useSellerMetrics'
import { CategoryDonut } from '@/features/seller-metrics/components/CategoryDonut'
import { PanelGrip, PanelReorder } from '@/features/seller-metrics/components/PanelReorder'
import { StatTile } from '@/features/seller-metrics/components/StatTile'
import { TopProductsTable } from '@/features/seller-metrics/components/TopProductsTable'
import { WidgetError } from '@/features/seller-metrics/components/WidgetError'
import { WidgetList } from '@/features/seller-metrics/components/WidgetList'
import { panelDropProps, usePanelOrder } from '@/features/seller-metrics/panelOrder'
import { orderAge, stockAlertSummary } from '@/features/seller-metrics/queueFacts'
import {
  useSellerOrderRows,
  useSellerProductRows,
} from '@/features/seller-portal/api/useSellerCatalog'
import { useSellerRefundRequests } from '@/features/refunds/api/useRefundRequests'
import { StatusBadge } from '@/features/seller-portal/components/StatusBadge'
import { useMyStore } from '@/features/store-settings/api/useStoreProfile'
import { formatShortDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'
import { cn } from '@/lib/utils'

const RANGES = [
  { value: 'month', label: 'This month' },
  { value: 'd30', label: 'Last 30 days' },
  { value: 'd7', label: 'Last 7 days' },
] as const

type RangeKey = (typeof RANGES)[number]['value']

const LOW_STOCK = 10

/** How many rows the top-products panel asks for. Also what tells a complete
 *  list ("top 4 of 4") from a truncated one apart. */
const TOP_PRODUCTS = 5

/** The slots the seller can reorder, in the order a fresh browser sees them. */
const CHART_PANELS = ['revenue', 'orders', 'top', 'category'] as const
const WIDGET_PANELS = ['ship', 'lowStock', 'recent', 'refunds'] as const
type ChartKey = (typeof CHART_PANELS)[number]
type WidgetKey = (typeof WIDGET_PANELS)[number]

/** The local calendar day, not the UTC one - toISOString() on a local date
 *  shifts the window by a day either side of UTC, and at the start of a month
 *  collapsed it to a single day in the previous one. */
function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Inclusive, so a window of one calendar day counts as one day. */
function dayCount(from: string, to: string): number {
  const span = Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)
  return Number.isNaN(span) ? 0 : Math.round(span / 86_400_000) + 1
}

/**
 * "1 Sep – 30 Sep · compared with the previous 30 days".
 *
 * The second clause is not decoration: every measure on this page carries a
 * delta, and without it the window those deltas are against is something the
 * seller has to infer. It names the comparison window, not its result - when
 * nothing was measured there, the tiles themselves say so.
 */
function rangeCaption(from: string, to: string): string {
  const span = `${formatShortDate(from)} – ${formatShortDate(to)}`
  const days = dayCount(from, to)
  if (days <= 0) return span
  return `${span} · compared with the previous ${days === 1 ? 'day' : `${days} days`}`
}

function rangeFor(key: RangeKey): MetricsRange {
  const to = new Date()
  const from = new Date(to)
  if (key === 'month') from.setDate(1)
  else from.setDate(to.getDate() - (key === 'd7' ? 6 : 29))
  return { from: isoDay(from), to: isoDay(to) }
}

// Single series each, so no legend: the card title names the measure and the
// one hue is the brand's.
const REVENUE_CONFIG = {
  revenue: { label: 'Revenue', color: 'var(--color-primary)' },
} satisfies ChartConfig
const ORDERS_CONFIG = {
  orders: { label: 'Orders', color: 'var(--color-primary)' },
} satisfies ChartConfig

function Panel({
  title,
  subtitle,
  headline,
  action,
  group,
  index,
  count,
  onMove,
  children,
}: {
  title: string
  /**
   * The one fact about the panel that its chart cannot state - the peak day,
   * the daily rate, how much of the catalogue a top-five covers. Omitted rather
   * than blanked when the panel has nothing measured to say.
   */
  subtitle?: string
  /** The panel's own headline figure, right-aligned against the title. */
  headline?: string
  action?: React.ReactNode
  /** Which order this panel belongs to, so a chart cannot be dropped on a widget. */
  group: string
  index: number
  count: number
  onMove: (from: number, to: number) => void
  children: React.ReactNode
}) {
  return (
    <section
      {...panelDropProps(group, index, onMove)}
      className="flex flex-col rounded-xl border p-5"
    >
      <div
        className={cn(
          'mb-4 flex flex-wrap justify-between gap-3',
          // Top-aligned only when there is a second line to align against;
          // a single-line header still centres on its buttons.
          subtitle ? 'items-start' : 'items-center',
        )}
      >
        <div className={cn('flex min-w-0 gap-2', subtitle ? 'items-start' : 'items-center')}>
          <PanelGrip group={group} index={index} />
          <div className="min-w-0">
            <h2 className="min-w-0 truncate text-[15px] font-bold">{title}</h2>
            {subtitle && (
              <p className="mt-[3px] truncate text-[13px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {headline && <span className="text-xl font-bold tabular-nums">{headline}</span>}
          {action}
          <PanelReorder title={title} index={index} count={count} onMove={onMove} />
        </div>
      </div>
      {/* A column, so a body shorter than the panel can choose what to do with
          the height the grid row gives it rather than leaving it all at the
          bottom. Panels in a row are the same height either way. */}
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  )
}

function PanelLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="text-[13px] font-semibold text-primary hover:underline">
      {children}
    </Link>
  )
}

/** The row action a queue widget ends in - "Ship", "Restock", "Review". Each
 *  carries what it acts on for a screen reader, because five identical "Ship"
 *  links in a row name nothing. */
function RowAction({
  to,
  label,
  subject,
  variant = 'outline',
}: {
  to: string
  label: string
  subject: string
  variant?: 'default' | 'outline'
}) {
  return (
    <Button asChild size="sm" variant={variant} className="shrink-0">
      <Link to={to}>
        {label}
        <span className="sr-only"> {subject}</span>
      </Link>
    </Button>
  )
}

export function SellerDashboard() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('month')
  const range = useMemo(() => rangeFor(rangeKey), [rangeKey])

  const metrics = useSellerMetrics(range)
  const top = useSellerTopProducts(range, TOP_PRODUCTS)
  const categories = useSellerCategoryBreakdown(range)

  // The page is headed by the shop, not by the word "Dashboard" - the seller
  // knows which screen they are on, and the one thing worth stating is which
  // store these numbers belong to. Read-only reuse of the store-settings query,
  // so both screens share one cache entry rather than fetching it twice.
  const store = useMyStore()

  // The queue widgets are the existing lists with a filter, not endpoints of
  // their own.
  const shipQueue = useSellerOrderRows({ status: 'PLACED', size: 5, sort: 'oldest' })
  const lowStock = useSellerProductRows({ stockBelow: LOW_STOCK, size: 5, sort: 'stock_asc' })
  const recent = useSellerOrderRows({ size: 5, sort: 'newest' })
  const refunds = useSellerRefundRequests({ status: 'REQUESTED', size: 5 })

  const charts = usePanelOrder<ChartKey>('charts', CHART_PANELS)
  const widgets = usePanelOrder<WidgetKey>('widgets', WIDGET_PANELS)

  const totals = metrics.data?.totals
  const previous = metrics.data?.previousTotals
  const series = metrics.data?.series ?? []

  const stock = lowStock.data
    ? stockAlertSummary(lowStock.data.content, lowStock.data.totalElements)
    : null
  // Never "No prior data": a count of alerts has no previous window to move
  // against, so this tile always says what the count is made of instead.
  const stockFlag = lowStock.isError
    ? 'Stock levels unavailable'
    : !stock
      ? 'Checking stock levels'
      : stock.complete
        ? `${stock.outOfStock} out of stock`
        : `at least ${stock.outOfStock} out of stock`

  const openRefunds = refunds.data?.content ?? []
  const refundTotal = refunds.data?.totalElements ?? 0
  // The money only when this page holds every open request - summing five of
  // eleven and calling it the total open amount would be a made-up figure.
  const refundNote = !refunds.data
    ? null
    : refundTotal === 0
      ? null
      : refundTotal > openRefunds.length
        ? `${refundTotal} open`
        : `${refundTotal} open · ${formatPrice(
            openRefunds.reduce((sum, request) => sum + request.requestedAmount, 0),
          )}`

  function chartPanel(key: ChartKey, index: number) {
    const shared = {
      group: 'chart',
      index,
      count: charts.order.length,
      onMove: charts.move,
    }

    if (key === 'revenue' || key === 'orders') {
      // Not gated on `series.length`: an empty window made both cards vanish,
      // and a card that disappears reads as a broken page rather than a quiet
      // month. Hidden only when the query failed, which the page-level block
      // already reports.
      if (metrics.isError) return null
      const isRevenue = key === 'revenue'
      // Read off the series rather than asked for: the peak day and the daily
      // rate are both facts about the points already on screen, so they cannot
      // disagree with the chart beside them.
      const peakDay = series.reduce((max, point) => Math.max(max, point.revenue), 0)
      const perDay = series.length === 0 ? 0 : (totals?.orders ?? 0) / series.length
      return (
        <Panel
          key={key}
          {...shared}
          title={isRevenue ? 'Revenue' : 'Orders per day'}
          subtitle={
            series.length === 0
              ? undefined
              : isRevenue
                ? `Peak day ${formatPrice(peakDay)}`
                : `${perDay.toFixed(1)} per day`
          }
          headline={
            totals
              ? isRevenue
                ? formatPrice(totals.revenue)
                : String(totals.orders)
              : undefined
          }
        >
          {metrics.isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : series.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No activity in this window.
            </p>
          ) : isRevenue ? (
            <ChartContainer config={REVENUE_CONFIG} className="h-[200px] w-full">
              <AreaChart data={series} margin={{ left: 4, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={formatShortDate}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => formatShortDate(String(value))}
                      formatter={(value) => formatPrice(Number(value))}
                    />
                  }
                />
                <Area
                  dataKey="revenue"
                  type="monotone"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  fill="var(--color-revenue)"
                  fillOpacity={0.12}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <ChartContainer config={ORDERS_CONFIG} className="h-[200px] w-full">
              <BarChart data={series} margin={{ left: 4, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={formatShortDate}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => formatShortDate(String(value))}
                    />
                  }
                />
                <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </Panel>
      )
    }

    if (key === 'top') {
      const topRows = top.data ?? []
      return (
        <Panel
          key={key}
          {...shared}
          title="Top products by revenue"
          // How many products sold at all is not something this endpoint
          // reports - it returns the best N and stops. A short page is
          // therefore the whole list and can be counted; a full one only
          // proves there were at least that many, and says so in the same
          // words the stock tile uses rather than naming a total nobody sent.
          subtitle={
            topRows.length === 0
              ? undefined
              : topRows.length < TOP_PRODUCTS
                ? `Top ${topRows.length} of ${topRows.length} products selling`
                : `Top ${topRows.length} of at least ${topRows.length} products selling`
          }
          action={<PanelLink to="/seller/products">All products</PanelLink>}
        >
          {top.isError ? (
            <WidgetError
              title="Couldn't load top products"
              error={top.error}
              onRetry={() => top.refetch()}
            />
          ) : (
            <TopProductsTable
              emptyLabel="No sales in this window."
              isLoading={top.isLoading}
              rows={topRows}
              windowRevenue={totals?.revenue}
            />
          )}
        </Panel>
      )
    }

    const categoryRows = categories.data ?? []
    return (
      <Panel
        key={key}
        {...shared}
        title="Sales by category"
        // Uncapped, unlike top products: the breakdown returns every category
        // with a sale, so this count is the whole truth and needs no hedging.
        subtitle={
          categoryRows.length === 0
            ? undefined
            : `${categoryRows.length} ${categoryRows.length === 1 ? 'category' : 'categories'} selling`
        }
      >
        {categories.isError ? (
          <WidgetError
            title="Couldn't load your categories"
            error={categories.error}
            onRetry={() => categories.refetch()}
          />
        ) : (
          <CategoryDonut
            emptyLabel="No sales in this window."
            isLoading={categories.isLoading}
            rows={categoryRows}
            totalLabel={totals ? formatPrice(totals.revenue) : '—'}
          />
        )}
      </Panel>
    )
  }

  function widgetPanel(key: WidgetKey, index: number) {
    const shared = {
      group: 'widget',
      index,
      count: widgets.order.length,
      onMove: widgets.move,
    }

    if (key === 'ship') {
      return (
        <Panel key={key} {...shared} title="Orders to ship" action={<PanelLink to="/seller/orders?group=to_pack">All orders</PanelLink>}>
          <WidgetList
            rows={shipQueue.data?.content ?? []}
            rowKey={(order) => order.id}
            emptyLabel="Nothing waiting."
            errorTitle="Couldn't load your ship queue"
            error={shipQueue.error}
            isError={shipQueue.isError}
            isLoading={shipQueue.isLoading}
            onRetry={() => shipQueue.refetch()}
            rowClass="h-9"
          >
            {(order) => {
              const age = orderAge(order.placedAt)
              return (
                <>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{order.recipientName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{order.reference}</span> ·{' '}
                      {order.itemCount === 1 ? '1 item' : `${order.itemCount} items`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Late is a state, so it gets a word and a shape of its
                        own rather than only a colour. */}
                    {age.overdue ? (
                      <Badge className="border-transparent bg-[#b42318]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#b42318]">
                        {age.label} waiting
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{age.label}</span>
                    )}
                    <RowAction
                      to={`/seller/orders/${order.id}`}
                      label="Ship"
                      subject={order.reference}
                      variant="default"
                    />
                  </div>
                </>
              )
            }}
          </WidgetList>
        </Panel>
      )
    }

    if (key === 'lowStock') {
      return (
        <Panel key={key} {...shared} title="Low stock" action={<PanelLink to="/seller/products?sort=stock_asc">All products</PanelLink>}>
          <WidgetList
            rows={lowStock.data?.content ?? []}
            rowKey={(product) => product.id}
            emptyLabel="Everything is stocked."
            errorTitle="Couldn't load your stock levels"
            error={lowStock.error}
            isError={lowStock.isError}
            isLoading={lowStock.isLoading}
            onRetry={() => lowStock.refetch()}
            rowClass="h-9"
          >
            {(product) => (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{product.title}</p>
                  {/* The design's second line. Not "the product's SKU" - there is
                      no such thing here, sku lives on variant - but the variant
                      the seller actually has to reorder, which the API picks as
                      the least-stocked one. Dropped entirely when the product has
                      no priced variant to name, rather than printing a dash: a
                      blank line is a smaller lie than a fake SKU. */}
                  {product.lowestStockVariant ? (
                    <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                      {product.lowestStockVariant.sku}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={
                      product.totalStock === 0
                        ? 'shrink-0 text-sm font-semibold text-[#b42318]'
                        : 'shrink-0 text-sm font-semibold text-[#8a5a00]'
                    }
                  >
                    {product.totalStock === 0 ? 'Out of stock' : `${product.totalStock} left`}
                  </span>
                  <RowAction
                    to={`/seller/products/${product.id}`}
                    label="Restock"
                    subject={product.title}
                  />
                </div>
              </>
            )}
          </WidgetList>
        </Panel>
      )
    }

    if (key === 'recent') {
      return (
        <Panel key={key} {...shared} title="Recent orders" action={<PanelLink to="/seller/orders">All orders</PanelLink>}>
          <WidgetList
            rows={recent.data?.content ?? []}
            rowKey={(order) => order.id}
            emptyLabel="No orders yet."
            errorTitle="Couldn't load your recent orders"
            error={recent.error}
            isError={recent.isError}
            isLoading={recent.isLoading}
            onRetry={() => recent.refetch()}
            rowClass="h-7"
          >
            {(order) => (
              <>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {order.reference}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{order.recipientName}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatPrice(order.total)}
                </span>
                <StatusBadge status={order.status} />
              </>
            )}
          </WidgetList>
        </Panel>
      )
    }

    return (
      <Panel
        key={key}
        {...shared}
        title="Refund requests"
        action={
          <>
            {refundNote && <span className="text-[13px] text-muted-foreground">{refundNote}</span>}
            <PanelLink to="/seller/refunds">Refunds</PanelLink>
          </>
        }
      >
        <WidgetList
          rows={openRefunds}
          rowKey={(request) => request.id}
          emptyLabel="Nothing waiting on a decision."
          errorTitle="Couldn't load your refunds"
          error={refunds.error}
          isError={refunds.isError}
          isLoading={refunds.isLoading}
          onRetry={() => refunds.refetch()}
          rowClass="h-9"
        >
          {(request) => (
            <>
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">{request.reference}</p>
                {/* The buyer and the reason the design prints here are on
                    RefundRequestDetail, not on the list row - a widget is not
                    worth five extra requests, so this says what the row knows. */}
                <p className="truncate text-xs text-muted-foreground">
                  {request.resolution === 'REPLACEMENT' ? 'Replacement' : 'Refund'}
                  {request.orderReference ? ` · order ${request.orderReference}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatPrice(request.requestedAmount)}
                </span>
                <RowAction
                  to={`/seller/refunds/${request.id}`}
                  label="Review"
                  subject={request.reference}
                />
              </div>
            </>
          )}
        </WidgetList>
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {/* A skeleton rather than "Dashboard" while the name is in flight:
              the fallback would otherwise be printed and then replaced, which
              reads as the page correcting itself. The fallback is still there
              for a store profile that never arrives, so the page always has a
              heading. */}
          {store.isLoading ? (
            <Skeleton className="h-7 w-44" />
          ) : (
            <h1 className="truncate text-xl font-bold">{store.data?.name ?? 'Dashboard'}</h1>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {metrics.data ? rangeCaption(metrics.data.from, metrics.data.to) : 'Loading…'}
          </p>
        </div>
        <Tabs value={rangeKey} onValueChange={(value) => setRangeKey(value as RangeKey)}>
          <TabsList>
            {RANGES.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {metrics.isError && (
        <WidgetError
          className="rounded-lg border p-6"
          title="Couldn't load your dashboard"
          error={metrics.error}
          onRetry={() => metrics.refetch()}
        />
      )}

      {metrics.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {totals && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Revenue"
            value={formatPrice(totals.revenue)}
            current={totals.revenue}
            previous={previous?.revenue}
          />
          <StatTile
            label="Orders"
            value={String(totals.orders)}
            current={totals.orders}
            previous={previous?.orders}
            caption={`${formatPrice(totals.averageOrderValue)} average order`}
          />
          <StatTile
            label="Stock alerts"
            value={stock ? String(stock.total) : '—'}
            current={stock?.total ?? 0}
            flag={stockFlag}
            caption={stock?.complete ? `${stock.low} below ${LOW_STOCK} units` : undefined}
          />
          {/* The design puts a conversion rate here, and there is nothing to
              put. Conversion is orders over views, and nothing in this product
              records a view - no impression, visit or page-view is stored
              anywhere, so the API returns null for both rather than a zero that
              would read as "nobody looked" or an estimate nobody measured. The
              tile keeps its place and states the gap, because a seller who sees
              three tiles where the design has four assumes the page is broken.
              It becomes a number the day views are recorded; see
              MetricTotals.views in the contract. */}
          <StatTile
            label="Conversion rate"
            unavailable="Not tracked yet"
            caption="Store views are not recorded"
          />
        </div>
      )}

      {/* One grid per band, in the seller's own order. Two columns rather than
          as-many-as-fit: each band holds four panels, and three across leaves
          the fourth alone in a two-thirds-empty row. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {charts.order.map((key, index) => chartPanel(key, index))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {widgets.order.map((key, index) => widgetPanel(key, index))}
      </div>
    </div>
  )
}
