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
  const hasPrevious = previous != null && previous !== 0
  const change = hasPrevious ? ((current - previous) / previous) * 100 : 0
  const flat = !hasPrevious || Math.abs(change) < 0.05
  const up = change > 0
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
          flat ? 'text-muted-foreground' : good ? 'text-[#1f7a45]' : 'text-[#b42318]',
        )}
      >
        {flat ? (
          <Minus className="size-3.5" aria-hidden />
        ) : up ? (
          <ArrowUp className="size-3.5" aria-hidden />
        ) : (
          <ArrowDown className="size-3.5" aria-hidden />
        )}
        {flat ? 'Flat' : `${up ? '+' : ''}${change.toFixed(1)}%`}
        <span className="text-muted-foreground">vs prev</span>
      </p>
    </div>
  )
}
