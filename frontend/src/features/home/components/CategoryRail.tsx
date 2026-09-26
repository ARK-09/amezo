import type { LucideIcon } from 'lucide-react'
import {
  Baby,
  Book,
  Car,
  Dumbbell,
  Footprints,
  Gamepad2,
  Home,
  Laptop,
  Package,
  Shirt,
  Sparkles,
  Tent,
  Utensils,
} from 'lucide-react'
import { Link } from 'react-router'

import type { Category } from '@/features/reference/api/useCategories'

import { SectionHeading } from './SectionHeading'

// Keyed on category SLUGS, which are stable - a name can be edited, and keying on
// the display text meant renaming "Apparel" silently dropped its icon. Anything the
// marketplace adds later falls back to the generic parcel rather than breaking the
// rail.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  electronics: Laptop,
  kitchen: Utensils,
  footwear: Footprints,
  outdoor: Tent,
  apparel: Shirt,
  books: Book,
  toys: Gamepad2,
  sports: Dumbbell,
  baby: Baby,
  beauty: Sparkles,
  home: Home,
  automotive: Car,
}

export function CategoryRail({
  categories,
  isLoading,
}: {
  categories: Category[]
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
          const Icon = CATEGORY_ICONS[category.slug] ?? Package
          return (
            <Link
              key={category.slug}
              to={`/search?category=${encodeURIComponent(category.slug)}`}
              className="group flex w-[132px] shrink-0 flex-col items-center gap-3"
            >
              <span className="flex aspect-square w-full items-center justify-center rounded-full border bg-muted transition-colors group-hover:border-primary/50 group-hover:bg-primary/5">
                <Icon className="size-7 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
              </span>
              <span className="text-center text-[13px] font-semibold">{category.name}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
