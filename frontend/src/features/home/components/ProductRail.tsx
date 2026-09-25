import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { ProductCard } from '@/features/search/components/ProductCard'
import { ProductCardSkeleton } from '@/features/search/components/ProductCardSkeleton'
import type { ProductSummary } from '@/features/search/schema/types'

export function ProductRail({
  title,
  description,
  viewAllTo,
  viewAllLabel,
  products,
  isLoading,
  isError,
  onRetry,
}: {
  title: string
  description: string
  viewAllTo: string
  viewAllLabel: string
  products: ProductSummary[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}) {
  // A rail that came back empty is merchandising noise, not an error - drop it
  // rather than leaving a heading over a blank strip.
  if (!isLoading && !isError && products.length === 0) return null

  const headingId = `rail-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <section aria-labelledby={headingId} className="mx-auto w-full max-w-[1320px] px-7 pt-14">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-lg font-bold">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to={viewAllTo}>
            {viewAllLabel}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      {isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-5 py-6">
          <p className="text-sm text-muted-foreground">Couldn't load these products.</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : (
        // A scroller rather than a grid: the rail shows whatever the catalog
        // returns without leaving a ragged half-empty final row.
        <div className="-mx-7 flex snap-x snap-mandatory gap-4 overflow-x-auto px-7 pb-2">
          {isLoading
            ? Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="w-[220px] shrink-0 snap-start">
                  <ProductCardSkeleton />
                </div>
              ))
            : products.map((product) => (
                <div key={product.id} className="w-[220px] shrink-0 snap-start">
                  <ProductCard product={product} />
                </div>
              ))}
        </div>
      )}
    </section>
  )
}
