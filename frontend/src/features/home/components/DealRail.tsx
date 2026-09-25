import { ProductTile } from '@/features/catalog/components/ProductTile'
import { ProductCardSkeleton } from '@/features/search/components/ProductCardSkeleton'
import type { ProductSummary } from '@/features/search/schema/types'
import { apiErrorMessage } from '@/lib/api/transient'

import { SectionHeading } from './SectionHeading'

export function DealRail({
  id,
  title,
  viewAllTo,
  products,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  id: string
  title: string
  viewAllTo: string
  products: ProductSummary[]
  isLoading: boolean
  isError: boolean
  // The landing page is the front door, so it is where a cold start is most
  // often met. "Couldn't load these products" described that as a failure of
  // the products; apiErrorMessage says the server is still starting.
  error?: unknown
  onRetry: () => void
}) {
  // A rail that came back empty is merchandising noise, not an error - drop it
  // rather than leaving a heading over a blank strip.
  if (!isLoading && !isError && products.length === 0) return null

  return (
    <section aria-labelledby={id}>
      <SectionHeading id={id} title={title} viewAllTo={viewAllTo} />

      {isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-5 py-6">
          <p className="text-sm text-muted-foreground">{apiErrorMessage(error)}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
          {isLoading
            ? Array.from({ length: 5 }, (_, i) => <ProductCardSkeleton key={i} />)
            : products.map((product) => <ProductTile key={product.id} product={product} />)}
        </div>
      )}
    </section>
  )
}
