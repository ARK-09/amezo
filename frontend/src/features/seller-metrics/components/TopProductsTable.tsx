import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TopProduct } from '@/features/seller-metrics/api/useSellerMetrics'
import { changeVsPrevious } from '@/features/seller-metrics/changeVsPrevious'
import { formatPrice } from '@/lib/formatPrice'
import { cn } from '@/lib/utils'

/**
 * One product against itself in the window before, in the same words and
 * arrows the KPI tiles use. Direction is never colour alone.
 */
function VsPrevious({ product }: { product: TopProduct }) {
  const change = changeVsPrevious(product.revenue, product.previousRevenue)

  // A null `previousRevenue` means the product did not sell in the previous
  // window, which is not the same as having sold nothing there: no figure was
  // measured, so there is no change to report. "+100%" or "New" would both
  // dress that absence up as something we worked out. The column is 74px wide
  // and "No prior data" does not fit, so the dash carries it on screen and the
  // tiles' own wording is kept for a screen reader.
  if (change.kind === 'unknown') {
    return (
      <span className="text-[13px] text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">{change.label}</span>
      </span>
    )
  }

  const Arrow = change.kind === 'flat' ? Minus : change.up ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-0.5 text-[13px] font-bold tabular-nums',
        change.kind === 'flat'
          ? 'font-semibold text-muted-foreground'
          : change.up
            ? 'text-[#1f7a45]'
            : 'text-[#b42318]',
      )}
    >
      <Arrow className="size-2.5 shrink-0" strokeWidth={3.4} aria-hidden />
      {change.label}
    </span>
  )
}

/**
 * The window's best sellers, ranked: position, product with its units and what
 * each one sold for, revenue, share of the window, and how each one moved
 * against the window before.
 *
 * Fixed layout with deliberate widths: an auto layout let a long product title
 * push the numeric columns out of the panel.
 */
export function TopProductsTable({
  rows,
  emptyLabel,
  isLoading = false,
  windowRevenue,
}: {
  rows: TopProduct[]
  emptyLabel: string
  /** Whether the query behind `rows` is still in flight. */
  isLoading?: boolean
  /** The whole window's revenue, for the footer's "top N share of" line. */
  windowRevenue?: number
}) {
  // Before the empty branch, never after: rows are empty until the first fetch
  // lands, and "no sales" is a claim about the shop, not about the request.
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  const shown = rows.reduce((sum, product) => sum + product.revenue, 0)

  return (
    <div>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 w-[26px] px-0 text-xs font-semibold">#</TableHead>
            <TableHead className="h-8 px-2 text-xs font-semibold">Product</TableHead>
            <TableHead className="h-8 w-[92px] px-2 text-right text-xs font-semibold">Revenue</TableHead>
            <TableHead className="h-8 w-14 px-0 text-right text-xs font-semibold">Share</TableHead>
            <TableHead className="h-8 w-[74px] pr-0 pl-2 text-right text-xs font-semibold">
              vs prev
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((product, index) => (
            <TableRow key={product.productId}>
              <TableCell className="px-0 py-3 text-[13px] font-bold tabular-nums text-muted-foreground">
                {index + 1}
              </TableCell>
              <TableCell className="px-2 py-3">
                <Link
                  to={`/products/${product.productRef}`}
                  className="block truncate text-sm font-semibold hover:text-primary"
                >
                  {product.title}
                </Link>
                {/* Only when there are units to divide by - an "each" price off
                    a zero unit count is a division by zero dressed as a fact. */}
                {product.units > 0 && (
                  <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                    {product.units} units · {formatPrice(product.revenue / product.units)} each
                  </p>
                )}
              </TableCell>
              <TableCell className="px-2 py-3 text-right text-[15px] font-bold tabular-nums">
                {formatPrice(product.revenue)}
              </TableCell>
              <TableCell className="px-0 py-3 text-right text-sm tabular-nums text-muted-foreground">
                {Math.round(product.share * 100)}%
              </TableCell>
              <TableCell className="py-3 pr-0 pl-2 text-right">
                <VsPrevious product={product} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Only with a window total to measure against; without one the label
          would be "top N share of" nothing. */}
      {windowRevenue != null && (
        <div className="flex justify-between gap-3 pt-3 text-[13px]">
          <span className="text-muted-foreground">
            Top {rows.length} share of {formatPrice(windowRevenue)}
          </span>
          <span className="font-bold tabular-nums">{formatPrice(shown)}</span>
        </div>
      )}
    </div>
  )
}
