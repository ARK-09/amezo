import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

export function RatingBadge({
  rating,
  className,
}: {
  rating: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex w-fit items-center gap-1 rounded-full bg-[#ffc53d] px-2.5 py-1 text-xs font-bold text-[#1d2026]',
        className,
      )}
    >
      <Star className="size-2.5 fill-current" />
      {rating.toFixed(1)}
    </span>
  )
}
