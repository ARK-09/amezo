import { Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * A product's average rating.
 *
 * Built on shadcn's Badge rather than a hand-rolled pill, so the shape and layout
 * come from the one place that defines what a badge is in this app.
 *
 * The overrides are deliberate and exact, not taste: Badge's base adds a 1px border
 * and forces `[&_svg]:size-3`, and this pill had neither - left alone they would grow
 * it by 2px and the star from 10px to 12px. `border-0` and `[&_svg]:size-2.5` hold it
 * to its existing size. The amber is not a semantic variant (it is not "warning"), so
 * it stays a local override rather than becoming a fifth Badge variant nothing else
 * would use.
 */
export function RatingBadge({ rating, className }: { rating: number; className?: string }) {
  return (
    <Badge
      className={cn(
        'gap-1 border-0 bg-[#ffc53d] px-2.5 py-1 font-bold text-[#1d2026] [&_svg]:size-2.5',
        className,
      )}
    >
      <Star className="fill-current" aria-hidden />
      {rating.toFixed(1)}
    </Badge>
  )
}
