import { ArrowDown, ArrowUp, CircleSlash, Minus, TriangleAlert } from 'lucide-react'

import { changeVsPrevious } from '@/features/seller-metrics/changeVsPrevious'
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
  flag,
  caption,
  unavailable,
}: {
  label: string
  /** Not needed when `unavailable` is set - there is no figure to print then. */
  value?: string
  current?: number
  previous?: number | null
  /** For measures where down is good. Nothing uses it yet; refunds will. */
  invertTone?: boolean
  /**
   * A standing state rather than a movement - "2 out of stock". Some measures
   * have no previous window to compare against, and printing "No prior data"
   * at a count of stock alerts says nothing a seller can act on. Takes the
   * change line's place when it is given, and wears an icon for the same
   * reason the arrows do.
   */
  flag?: string
  /** One more line under the change, for what the headline number leaves out. */
  caption?: string
  /**
   * The measure has no source at all, so there is nothing to print and nothing
   * to compare - not a zero, which would be a measurement, and not "No prior
   * data", which is about a missing previous window rather than a missing
   * measure. Takes the place of both the value and the change line, and the
   * text says what is not being tracked so the gap reads as a known one.
   */
  unavailable?: string
}) {
  // Shared with the Top products table's "vs prev" column, so the two places
  // this dashboard compares windows cannot drift apart.
  const change = changeVsPrevious(current ?? 0, previous)
  const muted = change.kind === 'unknown' || change.kind === 'flat'
  const good = invertTone ? !change.up : change.up

  return (
    // A labelled group, so the number and its change read as one thing to a
    // screen reader rather than as loose text on the page.
    <div role="group" aria-label={label} className="rounded-xl border p-5">
      <p className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          'mt-2 text-2xl font-bold tabular-nums',
          unavailable && 'text-muted-foreground',
        )}
      >
        {unavailable ? (
          <>
            {/* A dash is a shape, not a word - a screen reader gets the fact. */}
            <span aria-hidden>—</span>
            <span className="sr-only">Not available</span>
          </>
        ) : (
          value
        )}
      </p>
      {unavailable ? (
        <p className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
          <CircleSlash className="size-3.5" aria-hidden />
          {unavailable}
        </p>
      ) : flag ? (
        <p className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-[#8a5a00]">
          <TriangleAlert className="size-3.5" aria-hidden />
          {flag}
        </p>
      ) : (
        <p
          className={cn(
            'mt-1 inline-flex items-center gap-1 text-[13px] font-medium',
            muted ? 'text-muted-foreground' : good ? 'text-[#1f7a45]' : 'text-[#b42318]',
          )}
        >
          {change.kind === 'unknown' ? null : change.kind === 'flat' ? (
            <Minus className="size-3.5" aria-hidden />
          ) : change.up ? (
            <ArrowUp className="size-3.5" aria-hidden />
          ) : (
            <ArrowDown className="size-3.5" aria-hidden />
          )}
          {change.label}
          {/* Nothing to compare against means no "vs prev" to claim. */}
          {change.kind !== 'unknown' && <span className="text-muted-foreground">vs prev</span>}
        </p>
      )}
      {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </div>
  )
}
