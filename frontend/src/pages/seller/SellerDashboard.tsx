import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from 'recharts'

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
import { ShareList } from '@/features/seller-metrics/components/ShareList'
import { StatTile } from '@/features/seller-metrics/components/StatTile'
import { WidgetError } from '@/features/seller-metrics/components/WidgetError'
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

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function SellerDashboard() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('month')
  const range = useMemo(() => rangeFor(rangeKey), [rangeKey])

  const metrics = useSellerMetrics(range)
  const top = useSellerTopProducts(range, 4)
  const categories = useSellerCategoryBreakdown(range)

  // The queue widgets are the existing lists with a filter, not endpoints of
  // their own.
  const shipQueue = useSellerOrderRows({ status: 'PLACED', size: 5, sort: 'oldest' })
  const lowStock = useSellerProductRows({ stockBelow: LOW_STOCK, size: 5, sort: 'stock_asc' })
  const refunds = useSellerRefundRequests({ status: 'REQUESTED', size: 5 })

  const totals = metrics.data?.totals
  const previous = metrics.data?.previousTotals
  const series = metrics.data?.series ?? []

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
          />
          <StatTile
            label="Views"
            value={totals.views.toLocaleString('en-GB')}
            current={totals.views}
            previous={previous?.views}
          />
          <StatTile
            label="Conversion"
            value={`${(totals.conversionRate * 100).toFixed(1)}%`}
            current={totals.conversionRate}
            previous={previous?.conversionRate}
          />
        </div>
      )}

      {series.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Revenue">
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
          </Panel>

          <Panel title="Orders">
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
          </Panel>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Top products"
          action={
            <Link to="/seller/products" className="text-[13px] font-semibold text-primary hover:underline">
              All products
            </Link>
          }
        >
          {top.isError ? (
            <WidgetError
              title="Couldn't load top products"
              error={top.error}
              onRetry={() => top.refetch()}
            />
          ) : (
            <ShareList
              emptyLabel="No sales in this window."
              rows={(top.data ?? []).map((product) => ({
                key: product.productId,
                label: product.title,
                value: formatPrice(product.revenue),
                share: product.share,
                to: `/products/${product.productRef}`,
              }))}
            />
          )}
        </Panel>

        <Panel title="Revenue by category">
          {categories.isError ? (
            <WidgetError
              title="Couldn't load your categories"
              error={categories.error}
              onRetry={() => categories.refetch()}
            />
          ) : (
            <ShareList
              emptyLabel="No sales in this window."
              rows={(categories.data ?? []).map((row) => ({
                key: row.category.slug,
                label: row.category.name,
                value: formatPrice(row.revenue),
                share: row.share,
              }))}
            />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Waiting to ship"
          action={
            <Link to="/seller/orders?status=PLACED" className="text-[13px] font-semibold text-primary hover:underline">
              Orders
            </Link>
          }
        >
          {shipQueue.isError ? (
            <WidgetError
              title="Couldn't load your ship queue"
              error={shipQueue.error}
              onRetry={() => shipQueue.refetch()}
            />
          ) : (shipQueue.data?.content ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(shipQueue.data?.content ?? []).map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{order.recipientName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{order.reference}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Low stock"
          action={
            <Link to="/seller/products?sort=stock_asc" className="text-[13px] font-semibold text-primary hover:underline">
              Products
            </Link>
          }
        >
          {lowStock.isError ? (
            <WidgetError
              title="Couldn't load your stock levels"
              error={lowStock.error}
              onRetry={() => lowStock.refetch()}
            />
          ) : (lowStock.data?.content ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Everything is stocked.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(lowStock.data?.content ?? []).map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">{product.title}</p>
                  <span
                    className={
                      product.totalStock === 0
                        ? 'shrink-0 text-sm font-semibold text-[#b42318]'
                        : 'shrink-0 text-sm font-semibold text-[#8a5a00]'
                    }
                  >
                    {product.totalStock === 0 ? 'Out of stock' : `${product.totalStock} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Refunds to review"
          action={
            <Link to="/seller/refunds" className="text-[13px] font-semibold text-primary hover:underline">
              Refunds
            </Link>
          }
        >
          {refunds.isError ? (
            <WidgetError
              title="Couldn't load your refunds"
              error={refunds.error}
              onRetry={() => refunds.refetch()}
            />
          ) : (refunds.data?.content ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing waiting on a decision.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(refunds.data?.content ?? []).map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{request.reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {request.resolution === 'REPLACEMENT' ? 'Replacement' : 'Refund'}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatPrice(request.requestedAmount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
