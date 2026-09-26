import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { WidgetError } from '@/features/seller-metrics/components/WidgetError'
import type { ProblemDetail } from '@/lib/api/client'

/**
 * The body of a dashboard queue widget: the failure block, the skeleton, the
 * empty copy and the rows, in that order and always all four.
 *
 * One shell rather than the same four branches written out per widget, because
 * the order is the part that matters and is the part that was wrong before: a
 * widget that falls through to its empty copy while loading, or when its query
 * failed, tells a seller they have nothing waiting when nobody has answered
 * the question yet. A new widget gets that right by construction here.
 */
export function WidgetList<T>({
  rows,
  rowKey,
  children,
  emptyLabel,
  errorTitle,
  error,
  isError,
  isLoading,
  onRetry,
  rowClass,
}: {
  rows: T[]
  rowKey: (row: T) => string
  children: (row: T) => ReactNode
  emptyLabel: string
  errorTitle: string
  error?: ProblemDetail | null
  isError: boolean
  isLoading: boolean
  onRetry: () => void
  /** The height one settled row takes, so the skeleton does not resize the panel. */
  rowClass: string
}) {
  if (isError) {
    return <WidgetError title={errorTitle} error={error} onRetry={onRetry} />
  }

  if (isLoading) {
    // Five rows, because each queue asks for five, at the height the real rows
    // settle at so the panel does not jump when the data lands.
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={`${rowClass} w-full`} />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={rowKey(row)} className="flex items-center justify-between gap-3">
          {children(row)}
        </li>
      ))}
    </ul>
  )
}
