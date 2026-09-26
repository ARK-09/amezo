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
import { formatPrice } from '@/lib/formatPrice'

/**
 * The window's best sellers, ranked: position, product with its units and what
 * each one sold for, revenue, and share of the window.
 *
 * The design has a fifth column comparing each product with the previous
 * window. `TopProduct` carries no previous-window figure, and a delta is the
 * one number on a metrics screen that must never be guessed at, so the column
 * is left out rather than filled in.
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
