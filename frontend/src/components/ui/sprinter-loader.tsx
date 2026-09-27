import { useEffect, useState } from 'react'

import { Sprinter } from '@/components/ui/sprinter'
import { useBackendWaking } from '@/lib/api/useBackendWaking'
import { cn } from '@/lib/utils'

/**
 * A whole screen waiting on the API, with something true to say about the wait.
 *
 * This deployment's backend sleeps when idle, so the first request after a quiet
 * spell can take a few seconds. Three seconds of a motionless page reads as broken;
 * three seconds of a page that keeps moving AND keeps explaining itself reads as a
 * page doing its job. So the mark runs ({@link Sprinter}) and the line under it
 * changes as the wait goes on.
 *
 * <h2>What the copy is allowed to claim</h2>
 *
 * Only what is known. There is no percentage and no bar creeping toward an end it
 * cannot see - a request has no progress to report, and a bar that fills on a timer
 * is a guess dressed as a measurement. What IS known is how long the reader has been
 * waiting, and whether a request has already failed for an infrastructure reason and
 * is being retried ({@link useBackendWaking}) - which is the honest signal for "the
 * server is asleep", as opposed to a slow first load.
 *
 * So the line escalates on two real inputs:
 *
 * <ul>
 *   <li>under ~1.2s - the label, and nothing else. Most loads end here and never
 *       show a second word, which is what keeps a fast load feeling fast;</li>
 *   <li>past that - it says so, because silence at two seconds is where a reader
 *       starts reaching for reload;</li>
 *   <li>retrying after a failure - the cold start, named, with how long it takes.
 *       That beats any timer: it appears exactly when it is true.</li>
 * </ul>
 */

/** Long enough that a quick load never flashes a second message at anybody. */
const SETTLING_IN_MS = 1200

export function SprinterLoader({
  label = 'Loading',
  className,
}: {
  /** What is being waited for. Also the accessible name, so make it a thing, not a verb. */
  label?: string
  className?: string
}) {
  const waking = useBackendWaking()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    // Set from a timer, not during the effect: what it reports is the passage of
    // time, which nothing else in the render can derive.
    const timer = setTimeout(() => setSlow(true), SETTLING_IN_MS)
    return () => clearTimeout(timer)
  }, [])

  const message = waking
    ? 'Waking the server up — the free instance sleeps when idle, so this can take up to a minute.'
    : slow
      ? 'Still fetching — this one is taking a moment.'
      : null

  return (
    <div
      role="status"
      aria-label={label}
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-4 px-6 py-12 text-center', className)}
    >
      {/* text-primary is where the brand accent enters: the mark is drawn in
          currentColor, so this one class colours every stroke of it. */}
      <Sprinter size="lg" className="text-primary" />

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-sm font-semibold">{label}</p>
        {/* Reserved height, so the second line arriving does not shove the mark
            upward halfway through the wait. */}
        <p className="min-h-[2.5rem] max-w-[38ch] text-[13px] leading-[1.5] text-muted-foreground text-pretty">
          {message}
        </p>
      </div>
    </div>
  )
}
