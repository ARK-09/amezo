import { BadgeCheck, ChevronRight, Search, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { RatingBadge } from '@/components/RatingBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ProductTile } from '@/features/catalog/components/ProductTile'
import { ProductCardSkeleton } from '@/features/search/components/ProductCardSkeleton'
import {
  useFollowStore,
  usePublicStore,
  useStoreProducts,
  type PublicStore,
  type StoreSort,
} from '@/features/store/api/useStorefront'
import { MessageStoreDialog } from '@/features/store/components/MessageStoreDialog'
import { apiErrorMessage } from '@/lib/api/transient'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

const SORT_OPTIONS: { value: StoreSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'priceAsc', label: 'Price: low to high' },
  { value: 'priceDesc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
]

/** Stands in for a cover the seller has not uploaded, rather than a blank band. */
const COVER_STRIPES =
  'repeating-linear-gradient(45deg,rgba(255,255,255,0.09) 0 10px,rgba(255,255,255,0.02) 10px 20px)'

/** Sentinel for the unfiltered chip - not a real slug, so it cannot collide. */
const ALL_CATEGORIES = '__all__'

/** A page number is a whole one, zero or above, or it is 0. */
function pageParam(raw: string | null): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

/**
 * "Under 2h" and friends. The server sends minutes, not a phrase, so the
 * wording stays ours and does not need a release to change.
 */
function responseTime(minutes: number | null | undefined): string | null {
  if (minutes == null) return null
  if (minutes < 60) return 'Under 1h'
  if (minutes < 24 * 60) return `Under ${Math.ceil(minutes / 60)}h`
  const days = Math.ceil(minutes / (24 * 60))
  return `Under ${days} day${days === 1 ? '' : 's'}`
}

function joinedYear(joinedAt: string | null | undefined): string | null {
  if (!joinedAt) return null
  const year = new Date(joinedAt).getFullYear()
  return Number.isNaN(year) ? null : `Since ${year}`
}

function StoreStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-r px-6 py-4 last:border-r-0">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

/** The seller's own copy. A policy they never wrote is left out, not invented. */
function StorePolicyList({ store }: { store: PublicStore }) {
  const rows = [
    { label: 'Shipping', value: store.policies?.shipping },
    { label: 'Returns', value: store.policies?.returns },
    { label: 'Warranty', value: store.policies?.warranty },
    { label: 'Ships from', value: store.policies?.shipsFrom ?? store.location },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value))

  if (rows.length === 0) return null

  return (
    <div>
      <h2 className="text-base font-bold">Store policies</h2>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="m-0 font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function StoreHeaderSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border">
      <Skeleton className="h-[172px] w-full rounded-none" />
      <div className="flex flex-wrap items-end gap-6 px-6 pb-[22px]">
        <Skeleton className="-mt-[38px] size-[88px] shrink-0 rounded-xl" />
        <div className="min-w-[260px] flex-1 pt-4">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="mt-2.5 h-4 w-80" />
        </div>
      </div>
      <div className="grid border-t [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="border-r px-6 py-4 last:border-r-0">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="mt-1.5 h-3 w-24" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function StoreFront() {
  const { handle } = useParams<{ handle: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ALL_CATEGORIES
  const sort = (searchParams.get('sort') as StoreSort | null) ?? 'relevance'
  const page = pageParam(searchParams.get('page'))

  // Keeps the box responsive while the URL stays the single source of truth,
  // and re-seeds it when the URL changes under us (a Back press, a cleared filter).
  const [term, setTerm] = useState(q)
  const [seededFrom, setSeededFrom] = useState(q)
  if (seededFrom !== q) {
    setSeededFrom(q)
    setTerm(q)
  }

  const store = usePublicStore(handle)
  const filters = useMemo(
    () => ({
      q: q || undefined,
      category: category === ALL_CATEGORIES ? undefined : category,
      sort,
      page,
      size: PAGE_SIZE,
    }),
    [q, category, sort, page],
  )
  const products = useStoreProducts(handle, filters)
  const follow = useFollowStore(handle)

  function patch(next: Record<string, string | undefined>, replace = false) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== ALL_CATEGORIES) params.set(key, value)
      else params.delete(key)
    }
    // Any change to what is being asked for starts from the first page again.
    if (!('page' in next)) params.delete('page')
    setSearchParams(params, { replace })
  }

  // A filter is a navigation worth a Back press; a keystroke is not. The first
  // character pushes the entry Back escapes the search by, the rest replace it.
  function patchTerm(value: string) {
    setTerm(value)
    patch({ q: value }, Boolean(q))
  }

  const rows = products.data?.content ?? []
  const total = products.data?.totalElements ?? 0
  const totalPages = products.data?.totalPages ?? 1
  const shownPage = Math.min(page, Math.max(0, totalPages - 1))
  const categories = store.data?.categories ?? []
  const isFiltered = Boolean(q) || category !== ALL_CATEGORIES

  if (store.isError) {
    return (
      <div className="mx-auto w-full max-w-[1320px] flex-1 px-7 pt-5 pb-16">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">Couldn't load this store</p>
          <p className="text-sm text-muted-foreground">{apiErrorMessage(store.error)}</p>
          <Button variant="outline" onClick={() => store.refetch()}>
            Retry
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/search">Browse all products</Link>
          </Button>
        </div>
      </div>
    )
  }

  const rating = store.data?.averageRating ?? null
  const positive = store.data?.positiveRatingPct
  const replies = responseTime(store.data?.medianResponseMinutes)
  const joined = joinedYear(store.data?.joinedAt)

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
        {/* Plain text, not a link: there is no store directory to point at, and
            the design's own href is a placeholder. Visually identical either way. */}
        <span>Stores</span>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-foreground">{store.data?.name ?? handle}</span>
      </nav>

      {store.isPending ? (
        <StoreHeaderSkeleton />
      ) : (
        store.data && (
          <section className="overflow-hidden rounded-xl border">
            <div className="relative flex h-[172px] items-center justify-center bg-foreground">
              {store.data.coverUrl ? (
                <img
                  src={store.data.coverUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <div className="absolute inset-0" style={{ background: COVER_STRIPES }} />
              )}
            </div>

            <div className="flex flex-wrap items-end gap-6 px-6 pb-[22px]">
              <div className="-mt-[38px] flex size-[88px] shrink-0 items-center justify-center overflow-hidden rounded-xl border-[3px] border-background bg-muted">
                {store.data.logoUrl ? (
                  <img
                    src={store.data.logoUrl}
                    alt={`${store.data.name} logo`}
                    className="size-full object-cover"
                  />
                ) : (
                  <Store className="size-8 text-muted-foreground" aria-hidden />
                )}
              </div>

              <div className="min-w-[260px] flex-1 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold">{store.data.name}</h1>
                  {rating != null && <RatingBadge rating={rating} />}
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                    <BadgeCheck className="size-3.5 text-primary" aria-hidden />
                    Verified seller
                  </span>
                </div>
                <p className="mt-2 max-w-[64ch] text-sm text-muted-foreground">
                  {store.data.tagline ??
                    `${store.data.productCount} listing${store.data.productCount === 1 ? '' : 's'} on Amezo`}
                  {store.data.ratingCount
                    ? ` · ${store.data.ratingCount.toLocaleString()} review${store.data.ratingCount === 1 ? '' : 's'}`
                    : ''}
                </p>
              </div>

              <div className="flex gap-2.5 pt-4">
                {/* Null following means signed out - there is nobody to follow on
                    behalf of, so the control sends them to sign in instead. */}
                {store.data.following == null ? (
                  <Button className="h-10 rounded-full px-[22px]" asChild>
                    <Link to="/sign-in">Follow store</Link>
                  </Button>
                ) : (
                  <Button
                    className="h-10 rounded-full px-[22px]"
                    variant={store.data.following ? 'outline' : 'default'}
                    aria-pressed={store.data.following}
                    disabled={follow.isPending}
                    onClick={() => follow.mutate(!store.data!.following)}
                  >
                    {store.data.following ? 'Following' : 'Follow store'}
                  </Button>
                )}
                <MessageStoreDialog
                  handle={handle}
                  storeName={store.data.name}
                  signedIn={store.data.following != null}
                />
              </div>
            </div>

            {store.data.status === 'VACATION' && (
              <p className="border-t bg-muted/50 px-6 py-3 text-sm" role="status">
                <span className="font-semibold">This store is on holiday.</span>{' '}
                {store.data.vacationNote ?? 'Orders may take longer than usual.'}
              </p>
            )}

            <div className="grid border-t [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              <StoreStat value={String(store.data.productCount)} label="Products" />
              {positive != null && (
                <StoreStat value={`${Math.round(positive)}%`} label="Positive ratings" />
              )}
              {replies && <StoreStat value={replies} label="Response time" />}
              {joined && <StoreStat value={joined} label="On Amezo" />}
            </div>
          </section>
        )
      )}

      {(store.data?.about || store.data?.policies) && (
        <section className="mt-7 grid gap-8 border-b pb-7 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {store.data.about && (
            <div>
              <h2 className="text-base font-bold">About this store</h2>
              <p className="mt-2.5 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted-foreground">
                {store.data.about}
              </p>
            </div>
          )}
          <StorePolicyList store={store.data} />
        </section>
      )}

      {/* The design puts this in the site header. It lives on the page instead so
          the shared buyer header stays one component across every route. */}
      <div className="mt-7 flex items-center gap-2 rounded-full border-[1.5px] border-primary py-0.5 pr-0.5 pl-4 sm:max-w-[576px]">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          value={term}
          onChange={(e) => patchTerm(e.target.value)}
          aria-label="Search in this store"
          placeholder="Search in this store"
          className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {categories.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {[{ slug: ALL_CATEGORIES, name: 'All' }, ...categories].map((option) => (
            <button
              key={option.slug}
              type="button"
              onClick={() => patch({ category: option.slug })}
              aria-pressed={option.slug === category}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs transition-colors',
                option.slug === category
                  ? 'border-primary bg-primary font-semibold text-primary-foreground'
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
          {products.isPending ? 'Loading…' : `${total} product${total === 1 ? '' : 's'}`}
        </p>
        <div className="flex items-center gap-3">
          <label htmlFor="store-sort" className="text-sm text-muted-foreground">
            Sort by:
          </label>
          <select
            id="store-sort"
            value={sort}
            onChange={(e) => patch({ sort: e.target.value })}
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

      {products.isError && (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border py-12 text-center">
          <p className="font-medium">Couldn't load these listings</p>
          <p className="text-sm text-muted-foreground">{apiErrorMessage(products.error)}</p>
          <Button variant="outline" onClick={() => products.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!products.isError && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {products.isPending
            ? Array.from({ length: 5 }, (_, i) => <ProductCardSkeleton key={i} />)
            : rows.map((product) => (
                <ProductTile key={product.id} product={product} subtitle={product.category.name} />
              ))}
        </div>
      )}

      {products.isSuccess && rows.length === 0 && (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border py-12 text-center">
          <p className="font-medium">
            {isFiltered ? 'Nothing here matches that' : 'This store has no live listings'}
          </p>
          <p className="text-sm text-muted-foreground">
            {isFiltered
              ? 'Try a different search or category.'
              : 'Check back once the seller lists something.'}
          </p>
          {isFiltered ? (
            <Button variant="outline" onClick={() => patch({ q: undefined, category: undefined })}>
              Clear filters
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/search">Browse all products</Link>
            </Button>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-7 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            disabled={shownPage === 0}
            onClick={() => patch({ page: String(shownPage - 1) })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {shownPage + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={shownPage + 1 >= totalPages}
            onClick={() => patch({ page: String(shownPage + 1) })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
