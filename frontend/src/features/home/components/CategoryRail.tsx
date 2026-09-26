import { Link } from 'react-router'

import { categoryImage } from '@/features/reference/categoryImage'
import type { Category } from '@/features/reference/api/useCategories'

import { SectionHeading } from './SectionHeading'

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
      {/* Scrolls horizontally with no scrollbar painted under the tiles - see the
          rail-no-scrollbar utility in index.css. Swipe, wheel and keyboard scrolling
          all still work; only the bar is hidden, and only here. */}
      <div className="rail-no-scrollbar -mx-7 flex gap-4 overflow-x-auto px-7 pb-1">
        {categories.map((category) => {
          const image = categoryImage(category.slug)
          return (
            <Link
              key={category.slug}
              to={`/search?category=${encodeURIComponent(category.slug)}`}
              className="group flex w-[132px] shrink-0 flex-col items-center gap-3"
            >
              <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-full border bg-muted transition-colors group-hover:border-primary/50">
                {image ? (
                  <img
                    src={image}
                    // The adjacent label already names the category, so a copy here
                    // would just make a screen reader say it twice.
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <FallbackMark name={category.name} />
                )}
              </span>
              <span className="text-center text-[13px] font-semibold">{category.name}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/**
 * For a category the marketplace adds later, before anyone draws artwork for it.
 * Its initial on the muted tile beats a generic parcel icon repeated down the rail,
 * because two unknown categories at least look different from each other.
 */
function FallbackMark({ name }: { name: string }) {
  return (
    <span className="text-2xl font-bold text-muted-foreground" aria-hidden>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
