import { ArrowDown, ArrowUp, Minus } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A headline number with its change against the previous window. The arrow and
 * the words carry the direction, so it is never colour alone.
 */
export function StatTile({
  label,
  value,
  current,
  previous,
  invertTone = false,
}: {
  label: string
  value: string
  current: number
  previous?: number | null
  /** For measures where down is good. Nothing uses it yet; refunds will. */
  invertTone?: boolean
}) {
  // "There is no previous window" and "the previous window was zero" are
  // different facts. Treating both as flat reported the biggest movement a
  // seller can have - nothing to something - as no change at all.
  const hasPrevious = previous != null
  // A percentage against zero is a division by zero, so a move off zero shows
  // its direction with a word rather than Infinity or an invented figure.
  const fromZero = hasPrevious && previous === 0 && current !== 0
  const change = hasPrevious && previous !== 0 ? ((current - previous) / previous) * 100 : 0
  const flat = hasPrevious && !fromZero && Math.abs(change) < 0.05
  const up = fromZero ? current > 0 : change > 0
  const good = invertTone ? !up : up

  return (
    // A labelled group, so the number and its change read as one thing to a
    // screen reader rather than as loose text on the page.
    <div role="group" aria-label={label} className="rounded-xl border p-5">
      <p className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p
        className={cn(
          'mt-1 inline-flex items-center gap-1 text-[13px] font-medium',
          !hasPrevious || flat
            ? 'text-muted-foreground'
            : good
              ? 'text-[#1f7a45]'
              : 'text-[#b42318]',
        )}
      >
        {!hasPrevious ? null : flat ? (
          <Minus className="size-3.5" aria-hidden />
        ) : up ? (
          <ArrowUp className="size-3.5" aria-hidden />
        ) : (
          <ArrowDown className="size-3.5" aria-hidden />
        )}
        {!hasPrevious
          ? 'No prior data'
          : flat
            ? 'Flat'
            : fromZero
              ? 'New'
              : `${up ? '+' : ''}${change.toFixed(1)}%`}
        {/* Nothing to compare against means no "vs prev" to claim. */}
        {hasPrevious && <span className="text-muted-foreground">vs prev</span>}
      </p>
    </div>
  )
}
