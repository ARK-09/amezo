import type { LucideIcon } from 'lucide-react'
import { Baby, Book, Dumbbell, Footprints, Gamepad2, Laptop, Package, Shirt, Tent, Utensils } from 'lucide-react'
import { Link } from 'react-router'

// Keyed on the category names the catalog actually returns; anything the
// marketplace adds later falls back to the generic parcel icon rather than
// breaking the strip.
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

export function CategoryStrip({
  categories,
  isLoading,
}: {
  categories: string[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-[1320px] px-7 pt-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/60" />
          ))}
        </div>
      </section>
    )
  }

  if (categories.length === 0) return null

  return (
    <section aria-labelledby="shop-by-category" className="mx-auto w-full max-w-[1320px] px-7 pt-12">
      <h2 id="shop-by-category" className="mb-4 text-lg font-bold">
        Shop by category
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        {categories.map((category) => {
          const Icon = CATEGORY_ICONS[category] ?? Package
          return (
            <Link
              key={category}
              to={`/search?category=${encodeURIComponent(category)}`}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card px-3 py-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-sm font-medium">{category}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
