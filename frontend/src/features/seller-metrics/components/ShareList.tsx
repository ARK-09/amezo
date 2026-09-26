import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/skeleton'

/**
 * The ranked list the dashboard uses for top products and category share: a
 * label, its value, and a bar for the proportion.
 *
 * One hue throughout rather than a colour per row - the bar encodes magnitude,
 * which is a sequential job, and a rainbow here would imply an identity the
 * rows do not have.
 */
export function ShareList({
  rows,
  emptyLabel,
  isLoading = false,
}: {
  rows: { key: string; label: string; value: string; share: number; to?: string }[]
  emptyLabel: string
  /** Whether the query behind `rows` is still in flight. */
  isLoading?: boolean
}) {
  // Before the empty branch, never after: rows are empty until the first fetch
  // lands, so an unguarded `emptyLabel` states "no sales" as a fact about the
  // shop while it is still only a fact about the request. Same lie as the
  // failed-widget one WidgetError guards, just transient.
  if (isLoading) {
    return (
      // Rows of the same shape and count the list settles at, so the panel does
      // not jump when the data arrives. Plain divs rather than <li>s - a
      // placeholder is not a list item, and announcing four of them would be
      // the same false claim in the accessibility tree.
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            {row.to ? (
              <Link to={row.to} className="min-w-0 truncate text-sm font-medium hover:text-primary">
                {row.label}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-sm font-medium">{row.label}</span>
            )}
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {row.value}
              <span className="ml-2 text-xs">{Math.round(row.share * 100)}%</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, Math.round(row.share * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
