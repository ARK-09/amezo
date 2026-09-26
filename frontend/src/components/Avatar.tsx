import { displayNameFor, initialsFor } from '@/lib/displayName'
import { cn } from '@/lib/utils'

/**
 * The signed-in identity, and a reviewer's, shown as an avatar rather than as an
 * email address. Printing someone's email in a page header is both noise and a
 * small privacy leak on a shared screen.
 *
 * There is no avatar image anywhere in this system yet, so initials ARE the
 * fallback - and a deterministic colour per person keeps them distinguishable
 * without inventing an identity. src is accepted so the day an upload exists,
 * nothing here has to change.
 */
const PALETTE = [
  'bg-rose-200 text-rose-900',
  'bg-amber-200 text-amber-900',
  'bg-emerald-200 text-emerald-900',
  'bg-sky-200 text-sky-900',
  'bg-violet-200 text-violet-900',
  'bg-teal-200 text-teal-900',
]

/**
 * A stable colour from the identifier, so the same person is the same colour on
 * every page and between visits. A sum of char codes is enough - this only has to
 * spread names across six buckets, not resist collisions.
 */
function paletteFor(seed: string): string {
  let total = 0
  for (let i = 0; i < seed.length; i++) total += seed.charCodeAt(i)
  return PALETTE[total % PALETTE.length]
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  /** A name or an email - whatever the identity actually has. */
  name: string | null | undefined
  src?: string | null
  size?: 'sm' | 'md'
  className?: string
}) {
  const label = displayNameFor(name)
  const sizes = size === 'sm' ? 'size-7 text-[11px]' : 'size-8 text-xs'

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        className={cn('shrink-0 rounded-full object-cover', sizes, className)}
      />
    )
  }

  return (
    <span
      // The name is announced by whatever sits next to this, so the circle itself is
      // decoration; title gives it back on hover where the name is not shown.
      aria-hidden
      title={label}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        sizes,
        paletteFor(label),
        className,
      )}
    >
      {initialsFor(name || 'Anonymous')}
    </span>
  )
}
