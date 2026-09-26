import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

const VALUES = [1, 2, 3, 4, 5]

/**
 * The clickable five-star row, shared by the product page's form and the inline
 * block on My Orders so there is one accessible implementation rather than two.
 *
 * Radios, not buttons: a rating is one choice out of five, which is what a radio
 * group is, and it gets arrow-key navigation, a group label and a checked state
 * announced to assistive tech for free. The design draws the row as icons, so the
 * inputs are visually hidden and the star carries the focus ring.
 */
export function RatingStars({
  name,
  legend,
  legendClassName,
  value,
  onChange,
  className,
  starClassName,
  offStarClassName,
}: {
  /** Unique per row: two rows on one screen would otherwise share a group. */
  name: string
  legend: React.ReactNode
  legendClassName?: string
  value: number
  onChange: (rating: number) => void
  className?: string
  starClassName?: string
  /** Extra classes for a star above the current rating, for rows that dim them. */
  offStarClassName?: string
}) {
  return (
    <fieldset className={className}>
      <legend className={legendClassName}>{legend}</legend>
      {VALUES.map((star) => (
        <label key={star} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={star}
            checked={value === star}
            onChange={() => onChange(star)}
            className="peer sr-only"
          />
          <span className="sr-only">
            {star} star{star === 1 ? '' : 's'}
          </span>
          <Star
            aria-hidden
            className={cn(
              'peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
              starClassName,
              star > value && offStarClassName,
            )}
            fill={star <= value ? 'currentColor' : 'none'}
          />
        </label>
      ))}
    </fieldset>
  )
}
