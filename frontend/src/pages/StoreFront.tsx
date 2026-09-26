import { BadgeCheck, ChevronRight, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { RatingBadge } from '@/components/RatingBadge'
import { Button } from '@/components/ui/button'
import { ProductTile } from '@/features/catalog/components/ProductTile'
import { ProductCardSkeleton } from '@/features/search/components/ProductCardSkeleton'
import type { ProductSummary } from '@/features/search/schema/types'
import { useStoreProducts } from '@/features/store/api/useStoreProducts'
import { cn } from '@/lib/utils'
import { apiErrorMessage } from '@/lib/api/transient'

type StoreSort = 'relevance' | 'priceAsc' | 'priceDesc' | 'rating'

const SORT_OPTIONS: { value: StoreSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'priceAsc', label: 'Price: low to high' },
  { value: 'priceDesc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
]

const COVER_STRIPES =
  'repeating-linear-gradient(45deg,rgba(255,255,255,0.09) 0 10px,rgba(255,255,255,0.02) 10px 20px)'

function sortProducts(rows: ProductSummary[], sort: StoreSort): ProductSummary[] {
  const sorted = [...rows]
  if (sort === 'priceAsc') sorted.sort((a, b) => a.priceFrom - b.priceFrom)
  if (sort === 'priceDesc') sorted.sort((a, b) => b.priceFrom - a.priceFrom)
  if (sort === 'rating') sorted.sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
  return sorted
}

/** Sentinel for the unfiltered chip - not a real slug, so it can't collide. */
const ALL_CATEGORIES = '__all__'

export function StoreFront() {
  const { brand: brandParam } = useParams<{ brand: string }>()
  const brand = decodeURIComponent(brandParam ?? '')
  const query = useStoreProducts(brand)

  // Holds a category SLUG, or the sentinel for "no category filter".
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const [sort, setSort] = useState<StoreSort>('relevance')

  const products = useMemo(() => query.data ?? [], [query.data])

  /**
   * The categories this store actually lists, de-duplicated by slug. Derived from the
   * products rather than the system list on purpose: a store front's chips should
   * offer what this seller sells, not every category the marketplace has.
   */
  const categories = useMemo(() => {
    const bySlug = new Map(products.map((p) => [p.category.slug, p.category]))
    return [
      { slug: ALL_CATEGORIES, name: 'All' },
      ...Array.from(bySlug.values()).sort((a, b) => a.name.localeCompare(b.name)),
    ]
  }, [products])

  const visible = useMemo(() => {
    const filtered =
      category === ALL_CATEGORIES ? products : products.filter((p) => p.category.slug === category)
    return sortProducts(filtered, sort)
  }, [products, category, sort])

  // Every figure on the page is computed from the listings themselves - there
  // is no seller profile API carrying ratings, policies or fulfilment data.
  const rated = products.filter((p) => p.avgRating != null)
  const averageRating =
    rated.length > 0 ? rated.reduce((sum, p) => sum + (p.avgRating ?? 0), 0) / rated.length : null
  const inStockCount = products.filter((p) => p.inStock).length

  return (
    <div className="mx-auto w-full max-w-[1320px] flex-1 px-7 pt-5 pb-16">
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <Link to="/" className="hover:text-primary">
          Home
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-foreground">{brand}</span>
      </nav>

      {query.isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">Couldn't load this store</p>
          <p className="text-sm text-muted-foreground">
            {apiErrorMessage(query.error)}
          </p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {query.isSuccess && products.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">No store found for “{brand}”</p>
          <p className="text-sm text-muted-foreground">
            This seller has no live listings right now.
          </p>
          <Button variant="outline" asChild>
            <Link to="/search">Browse all products</Link>
          </Button>
        </div>
      )}

      {(query.isLoading || products.length > 0) && (
        <>
          <section className="overflow-hidden rounded-xl border">
            <div className="relative flex h-[172px] items-center justify-center bg-foreground">
              <div className="absolute inset-0" style={{ background: COVER_STRIPES }} />
            </div>

            <div className="flex flex-wrap items-end gap-6 px-6 pb-[22px]">
              <div className="-mt-[38px] flex size-[88px] shrink-0 items-center justify-center rounded-xl border-[3px] border-background bg-muted">
                <Store className="size-8 text-muted-foreground" aria-hidden />
              </div>

              <div className="min-w-[260px] flex-1 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold">{brand}</h1>
                  {averageRating != null && <RatingBadge rating={averageRating} />}
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                    <BadgeCheck className="size-3.5 text-primary" aria-hidden />
                    Verified seller
                  </span>
                </div>
                <p className="mt-2 max-w-[64ch] text-sm text-muted-foreground">
                  {products.length} listing{products.length === 1 ? '' : 's'} on Amezo
                  {averageRating != null && ` · rated ${averageRating.toFixed(1)} across the range`}
                  .
                </p>
              </div>
            </div>

            <div className="grid border-t [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              {[
                { value: String(products.length), label: 'Products' },
                {
                  value: averageRating != null ? averageRating.toFixed(1) : '—',
                  label: 'Average rating',
                },
                { value: String(inStockCount), label: 'In stock now' },
              ].map((stat) => (
                <div key={stat.label} className="border-r px-6 py-4 last:border-r-0">
                  <div className="text-lg font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </section>

          {categories.length > 1 && (
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              {categories.map((option) => (
                <button
                  key={option.slug}
                  type="button"
                  onClick={() => setCategory(option.slug)}
                  aria-pressed={option.slug === category}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs transition-colors',
                    option.slug === category
                      ? 'border-primary bg-primary text-primary-foreground font-semibold'
                      : 'bg-background hover:bg-accent',
                  )}
                >
                  {option.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {visible.length} product{visible.length === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-3">
              <label htmlFor="store-sort" className="text-sm text-muted-foreground">
                Sort by:
              </label>
              <select
                id="store-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as StoreSort)}
                className="h-9 rounded-md border bg-background px-2.5 text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {query.isLoading
              ? Array.from({ length: 5 }, (_, i) => <ProductCardSkeleton key={i} />)
              : visible.map((product) => (
                  <ProductTile key={product.id} product={product} subtitle={product.category.name} />
                ))}
          </div>
        </>
      )}
    </div>
  )
}
