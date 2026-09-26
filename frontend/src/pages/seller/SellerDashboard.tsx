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
import { formatShortDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'

const RANGES = [
  { value: 'month', label: 'This month' },
  { value: 'd30', label: 'Last 30 days' },
  { value: 'd7', label: 'Last 7 days' },
] as const

type RangeKey = (typeof RANGES)[number]['value']

const LOW_STOCK = 10

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
  action,
  group,
  index,
  count,
  onMove,
  children,
}: {
  title: string
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PanelGrip group={group} index={index} />
          <h2 className="min-w-0 truncate text-[15px] font-bold">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
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
  const top = useSellerTopProducts(range, 5)
  const categories = useSellerCategoryBreakdown(range)

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
      return (
        <Panel key={key} {...shared} title={isRevenue ? 'Revenue' : 'Orders'}>
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
      return (
        <Panel key={key} {...shared} title="Top products" action={<PanelLink to="/seller/products">All products</PanelLink>}>
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
              rows={top.data ?? []}
              windowRevenue={totals?.revenue}
            />
          )}
        </Panel>
      )
    }

    return (
      <Panel key={key} {...shared} title="Revenue by category">
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
            rows={categories.data ?? []}
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
        <Panel key={key} {...shared} title="Waiting to ship" action={<PanelLink to="/seller/orders?status=PLACED">Orders</PanelLink>}>
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
        <Panel key={key} {...shared} title="Low stock" action={<PanelLink to="/seller/products?sort=stock_asc">Products</PanelLink>}>
          <WidgetList
            rows={lowStock.data?.content ?? []}
            rowKey={(product) => product.id}
            emptyLabel="Everything is stocked."
            errorTitle="Couldn't load your stock levels"
            error={lowStock.error}
            isError={lowStock.isError}
            isLoading={lowStock.isLoading}
            onRetry={() => lowStock.refetch()}
            rowClass="h-8"
          >
            {(product) => (
              <>
                <p className="min-w-0 truncate text-sm font-medium">{product.title}</p>
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
        title="Refunds to review"
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
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {metrics.data
              ? `${formatShortDate(metrics.data.from)} – ${formatShortDate(metrics.data.to)}`
              : 'Loading…'}
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
          <StatTile
            label="Conversion"
            value={`${(totals.conversionRate * 100).toFixed(1)}%`}
            current={totals.conversionRate}
            previous={previous?.conversionRate}
            caption={`${totals.views.toLocaleString('en-GB')} store views`}
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
