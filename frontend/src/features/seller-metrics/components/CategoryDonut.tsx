import { useId } from 'react'
import { Cell, Pie, PieChart } from 'recharts'

import {
  ChartContainer,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { donutSlices } from '@/features/seller-metrics/categoryPalette'
import type { CategoryShare } from '@/features/seller-metrics/api/useSellerMetrics'
import { formatPrice } from '@/lib/formatPrice'

/** The design's ring: a 168px box, a 20px band on a 54/140 radius. */
const BOX = 168
const OUTER_RADIUS = 77
const INNER_RADIUS = 53

/**
 * Revenue split by category, as a donut with the window's total in the middle.
 *
 * The legend is not decoration and is not optional: it carries every slice's
 * name, share and revenue, so the chart is still readable with the colours
 * stripped out - by a colour-blind seller, in a print, or in forced colours.
 * The 2px gap between segments does the same job at the ring itself, keeping
 * two fills from ever touching. See `categoryPalette.ts` for why both are load
 * bearing rather than taste.
 */
export function CategoryDonut({
  rows,
  totalLabel,
  emptyLabel,
  isLoading = false,
}: {
  rows: CategoryShare[]
  /** The window's total revenue, already formatted, for the centre of the ring. */
  totalLabel: string
  emptyLabel: string
  /** Whether the query behind `rows` is still in flight. */
  isLoading?: boolean
}) {
  // The same id on the wrapper and on the chart, so the slice colours
  // ChartStyle writes are in scope for the legend swatches too - they sit
  // outside the chart element, which is where those variables normally stop.
  const rawId = useId()
  const chartId = `chart-${rawId}`

  // Before the empty branch, never after: a query that has not answered yet is
  // not a shop with no sales. Same rule the other widgets follow.
  if (isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Skeleton className="size-[168px] shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 basis-[150px] flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  const slices = donutSlices(rows)
  const config: ChartConfig = Object.fromEntries(
    slices.map((slice) => [
      slice.key,
      { label: slice.label, theme: { light: slice.color.light, dark: slice.color.dark } },
    ]),
  )

  return (
    <div data-chart={chartId} className="flex flex-1 flex-wrap items-center gap-5">
      <ChartStyle id={chartId} config={config} />
      <div className="relative shrink-0" style={{ width: BOX, height: BOX }}>
        <ChartContainer id={rawId} config={config} className="aspect-square size-full">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => (
                    <div className="flex w-full items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{ background: `var(--color-${String(name)})` }}
                      />
                      <span className="flex-1 text-muted-foreground">
                        {config[String(name)]?.label ?? String(name)}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatPrice(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={slices}
              dataKey="revenue"
              nameKey="key"
              innerRadius={INNER_RADIUS}
              outerRadius={OUTER_RADIUS}
              paddingAngle={2}
              strokeWidth={0}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={`var(--color-${slice.key})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        {/* Over the ring rather than inside the SVG: the hole is empty space,
            and a div there keeps the total in page text rather than in a
            <text> a screen reader reads out of order. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-[11px] font-semibold text-muted-foreground">Total</span>
          <span className="text-lg font-bold tabular-nums">{totalLabel}</span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 basis-[150px] flex-col gap-3">
        {slices.map((slice) => (
          <li key={slice.key} className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: `var(--color-${slice.key})` }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {slice.label}
              </span>
              <span className="shrink-0 text-[13px] font-bold tabular-nums">
                {Math.round(slice.share * 100)}%
              </span>
            </div>
            <p className="mt-0.5 ml-[18px] text-xs tabular-nums text-muted-foreground">
              {formatPrice(slice.revenue)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
