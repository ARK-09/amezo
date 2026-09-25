import type { LucideIcon } from 'lucide-react'
import { Baby, Book, Dumbbell, Footprints, Gamepad2, Laptop, Package, Shirt, Tent, Utensils } from 'lucide-react'
import { Link } from 'react-router'

import { SectionHeading } from './SectionHeading'

// Keyed on the category names the catalog actually returns; anything the
// marketplace adds later falls back to the generic parcel icon rather than
// breaking the rail.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Electronics: Laptop,
  Kitchen: Utensils,
  Footwear: Footprints,
  Outdoor: Tent,
  Apparel: Shirt,
  Clothing: Shirt,
  Books: Book,
  Toys: Gamepad2,
  Sports: Dumbbell,
  Baby: Baby,
}

export function CategoryRail({
  categories,
  isLoading,
}: {
  categories: string[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <section>
        <div className="mb-[18px] h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex w-[132px] shrink-0 flex-col items-center gap-3">
              <div className="aspect-square w-full animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (categories.length === 0) return null

  return (
    <section aria-labelledby="popular-categories">
      <SectionHeading id="popular-categories" title="Explore popular categories" viewAllTo="/search" />
      <div className="-mx-7 flex gap-4 overflow-x-auto px-7 pb-1">
        {categories.map((category) => {
          const Icon = CATEGORY_ICONS[category] ?? Package
          return (
            <Link
              key={category}
              to={`/search?category=${encodeURIComponent(category)}`}
              className="group flex w-[132px] shrink-0 flex-col items-center gap-3"
            >
              <span className="flex aspect-square w-full items-center justify-center rounded-full border bg-muted transition-colors group-hover:border-primary/50 group-hover:bg-primary/5">
                <Icon className="size-7 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
              </span>
              <span className="text-center text-[13px] font-semibold">{category}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
