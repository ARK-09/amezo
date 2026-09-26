import type { components } from '@/lib/api/schema'

type MetricPoint = components['schemas']['MetricPoint']
type MetricTotals = components['schemas']['MetricTotals']
type SellerMetrics = components['schemas']['SellerMetrics']
type TopProduct = components['schemas']['TopProduct']
type CategoryShare = components['schemas']['CategoryShare']

/**
 * Seller analytics for local development and tests.
 *
 * `views` and `conversionRate` are null here because they are null on the
 * backend: nothing in the schema records a view, an impression or a visit, so
 * there is no number to serve. This mock deliberately does not supply one - a
 * dashboard that looks complete against the mock and then loses a tile against
 * the real API is worse than one that is honest in both. Everything else below
 * is deterministic rather than random so a chart does not move between runs.
 */

function pointFor(date: Date): MetricPoint {
  const day = Math.floor(date.getTime() / 86_400_000)
  const weekend = date.getDay() === 0 || date.getDay() === 6
  const orders = Math.max(2, Math.round((380 + ((day * 37) % 160) + (weekend ? 95 : 0)) * 0.034))
  const aov = 112 + ((day * 13) % 40)
  return {
    date: date.toISOString().slice(0, 10),
    views: null,
    orders,
    revenue: Math.round(orders * aov),
  }
}

function seriesBetween(from: string, to: string): MetricPoint[] {
  const out: MetricPoint[] = []
  const cursor = new Date(`${from}T12:00:00Z`)
  const end = new Date(`${to}T12:00:00Z`)
  while (cursor <= end) {
    out.push(pointFor(new Date(cursor)))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

function totalsOf(points: MetricPoint[]): MetricTotals {
  const orders = points.reduce((sum, p) => sum + p.orders, 0)
  const revenue = points.reduce((sum, p) => sum + p.revenue, 0)
  return {
    // Not measured, so not claimed - see the note at the top of this file.
    views: null,
    orders,
    revenue,
    conversionRate: null,
    averageOrderValue: orders === 0 ? 0 : revenue / orders,
  }
}

export function metricsFor(from: string, to: string): SellerMetrics {
  const series = seriesBetween(from, to)
  // The immediately preceding window of equal length, which is what the deltas
  // on the dashboard compare against.
  const spanDays = Math.max(1, series.length)
  const previousEnd = new Date(`${from}T12:00:00Z`)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousStart.getUTCDate() - (spanDays - 1))

  return {
    from,
    to,
    currency: 'USD',
    totals: totalsOf(series),
    previousTotals: totalsOf(
      seriesBetween(previousStart.toISOString().slice(0, 10), previousEnd.toISOString().slice(0, 10)),
    ),
    series,
  }
}

// previousRevenue is the same product in the window before. One product is
// deliberately null - it did not sell then, which is a fact rather than a zero,
// and it is the case the table has to render as "no comparison" rather than as
// a 100% rise.
const TOP_PRODUCTS: Omit<TopProduct, 'share'>[] = [
  { productId: '22222222-2222-2222-2222-222222222222', productRef: '14-ultrabook-laptop-16gb-ram', title: '14" Ultrabook Laptop, 16GB RAM', thumbnailUrl: null, units: 31, revenue: 27869, previousRevenue: 21444 },
  { productId: '55555555-5555-5555-5555-555555555555', productRef: 'mechanical-keyboard-hot-swappable', title: 'Mechanical Keyboard, Hot-Swappable', thumbnailUrl: null, units: 58, revenue: 8642, previousRevenue: 9310 },
  { productId: '11111111-1111-1111-1111-111111111111', productRef: 'wireless-noise-cancelling-headphones', title: 'Wireless Noise-Cancelling Headphones', thumbnailUrl: null, units: 44, revenue: 5719, previousRevenue: null },
  { productId: '33333333-3333-3333-3333-333333333333', productRef: 'ceramic-non-stick-cookware-set-10-piece', title: 'Ceramic Non-Stick Cookware Set (10-piece)', thumbnailUrl: null, units: 22, revenue: 1639, previousRevenue: 1636 },
]

export function topProducts(limit: number): TopProduct[] {
  const total = TOP_PRODUCTS.reduce((sum, p) => sum + p.revenue, 0)
  return TOP_PRODUCTS.slice(0, limit).map((product) => ({
    ...product,
    share: product.revenue / total,
  }))
}

const CATEGORY_REVENUE: { slug: string; name: string; revenue: number; units: number }[] = [
  { slug: 'electronics', name: 'Electronics', revenue: 42230, units: 133 },
  { slug: 'kitchen', name: 'Kitchen', revenue: 1639, units: 22 },
  { slug: 'outdoor', name: 'Outdoor', revenue: 880, units: 40 },
]

export function categoryBreakdown(): CategoryShare[] {
  const total = CATEGORY_REVENUE.reduce((sum, c) => sum + c.revenue, 0)
  return CATEGORY_REVENUE.map(({ slug, name, revenue, units }) => ({
    category: { slug, name },
    revenue,
    units,
    share: revenue / total,
  }))
}
