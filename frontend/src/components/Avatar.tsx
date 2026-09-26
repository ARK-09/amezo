import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { displayNameFor, initialsFor } from '@/lib/displayName'
import { cn } from '@/lib/utils'

/**
 * The signed-in identity, and a reviewer's, shown as an avatar rather than as an
 * email address.
 *
 * A thin wrapper over shadcn's Avatar rather than a hand-built circle: the primitive
 * already handles the part that is actually fiddly, which is showing the fallback
 * only once the image has genuinely failed or is still loading, instead of flashing
 * initials under every avatar on first paint.
 *
 * What stays local is the only thing shadcn has no opinion about: which initials to
 * show and which colour to use. There is no avatar upload in this system yet, so
 * initials ARE the normal case, and a deterministic colour per person keeps people
 * distinguishable without inventing an identity for them.
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

  return (
    <AvatarRoot
      // The name is announced by whatever sits next to this, so the circle itself is
      // decoration; title gives it back on hover where the name is not shown.
      aria-hidden
      title={label}
      className={cn(sizes, className)}
    >
      {src && <AvatarImage src={src} alt={label} />}
      <AvatarFallback className={paletteFor(label)}>
        {initialsFor(name || 'Anonymous')}
      </AvatarFallback>
    </AvatarRoot>
  )
}
