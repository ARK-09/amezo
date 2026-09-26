import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PaginationBar } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useBuyerOrderFacets,
  useBuyerOrders,
  type BuyerOrderFilters,
  type BuyerOrderGroup,
} from '@/features/orders/api/useBuyerOrders'
import { OrderCard } from '@/features/orders/components/OrderCard'
import { useSession } from '@/features/session/api/useSession'
import { cn } from '@/lib/utils'

const TABS: { value: BuyerOrderGroup; label: string }[] = [
  { value: 'all', label: 'All orders' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'refunds', label: 'Refunds & returns' },
]

const PERIODS = [
  { value: 'all', label: 'All time' },
  { value: '12m', label: 'Past 12 months' },
  { value: '6m', label: 'Past 6 months' },
  { value: '30d', label: 'Past 30 days' },
] as const

type Period = (typeof PERIODS)[number]['value']

/** The sizes the design's Per page select offers, and the one it opens on. */
const PAGE_SIZES = [5, 10, 20, 50] as const
const DEFAULT_SIZE = 10

/** The period select narrows the window; the server takes plain dates. */
function periodStart(period: Period): string | undefined {
  if (period === 'all') return undefined
  const now = new Date()
  const days = period === '30d' ? 30 : period === '6m' ? 183 : 365
  now.setDate(now.getDate() - days)
  return now.toISOString().slice(0, 10)
}

/**
 * ?page=abc, ?page=-5 and ?page=1.7 used to go straight into the request and
 * into "Page NaN of 1". A page number is a whole one, zero or above, or it is 0.
 */
function pageParam(raw: string | null) {
  const parsed = Number(raw ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

/**
 * Same treatment for ?size=: junk is the default, and ?size=10000 is a request
 * for every order ever placed in one response. Only the offered sizes count.
 */
function sizeParam(raw: string | null) {
  const parsed = Number(raw)
  return PAGE_SIZES.some((size) => size === parsed) ? parsed : DEFAULT_SIZE
}

export function MyOrders() {
  const session = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(null)

  const group = (searchParams.get('group') as BuyerOrderGroup | null) ?? 'all'
  const q = searchParams.get('q') ?? ''
  const period = (searchParams.get('period') as Period | null) ?? '12m'
  const page = pageParam(searchParams.get('page'))
  const size = sizeParam(searchParams.get('size'))

  // The box is controlled so it can never disagree with the list: the Back
  // button rewrites ?q= underneath it, and a defaultValue input went on showing
  // the term it was mounted with. Re-seeded during render rather than from an
  // effect - react(set-state-in-effect).
  const [term, setTerm] = useState(q)
  const [seededFrom, setSeededFrom] = useState(q)
  if (seededFrom !== q) {
    setSeededFrom(q)
    setTerm(q)
  }

  const filters = useMemo<BuyerOrderFilters>(
    () => ({
      group,
      q: q || undefined,
      from: periodStart(period),
      page,
      size,
    }),
    [group, q, period, page, size],
  )

  const query = useBuyerOrders(filters)
  // The same window the list is showing, spelled the way each endpoint takes
  // it: a `from` date for the list, the period token for the counts. No
  // `group` - the strip describes every bucket, so narrowing the counts by the
  // tab being viewed would zero the other three.
  const facets = useBuyerOrderFacets({ q: q || undefined, period })

  function patch(next: Record<string, string | undefined>, replace = false) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    // Any filter change starts from the first page again.
    if (!('page' in next)) params.delete('page')
    setSearchParams(params, { replace })
  }

  // A tab, a period or a page is a navigation the buyer may want to undo with
  // Back; a keystroke is not. The first character pushes the one entry that
  // Back escapes the search by, and every character after it replaces that
  // entry - typing "laptop" used to leave six entries to press Back through.
  function patchTerm(value: string) {
    setTerm(value)
    patch({ q: value }, Boolean(q))
  }

  const orders = query.data?.content ?? []
  const total = query.data?.totalElements ?? 0
  const totalPages = query.data?.totalPages ?? 1
  // A ?page= past the end comes back empty; don't also print a page number that
  // doesn't exist, and let Previous walk back into the range that does.
  const shownPage = Math.min(page, totalPages - 1)

  return (
    <div className="mx-auto w-full max-w-[1320px] flex-1 px-7 pt-5 pb-[72px]">
      <nav
        aria-label="Breadcrumb"
        className="mb-[18px] flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <Link to="/" className="hover:text-primary">
          Home
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link to="/account" className="hover:text-primary">
          Your account
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-foreground">Orders</span>
      </nav>

      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-[1.2] font-bold tracking-[-0.01em]">Your orders</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {session.data?.email
              ? `Signed in as ${session.data.email}`
              : 'Everything you have bought on Amezo'}
          </p>
        </div>
        <Link
          to="/search"
          className="inline-flex h-[38px] items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition-colors hover:border-primary hover:text-primary"
        >
          Keep shopping
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="relative max-w-[460px] min-w-[240px] flex-1 basis-[320px]">
          <Search
            className="absolute top-1/2 left-3.5 size-[15px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={term}
            onChange={(e) => patchTerm(e.target.value)}
            placeholder="Search by order number or product name"
            aria-label="Search your orders"
            className="h-10 w-full rounded-full border bg-background pr-4 pl-[38px] text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Select value={period} onValueChange={(value) => patch({ period: value })}>
          <SelectTrigger
            aria-label="Filter by date"
            className="h-10 rounded-full px-3.5 text-[13px] font-semibold"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="ml-auto text-[13px] text-muted-foreground">
          {query.isLoading ? 'Loading…' : `${total} order${total === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b pb-4">
        {TABS.map((tab) => {
          const isActive = tab.value === group
          const count = facets.data?.get(tab.value)
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => patch({ group: tab.value === 'all' ? undefined : tab.value })}
              className={cn(
                'inline-flex h-[34px] items-center gap-[7px] rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                isActive
                  ? 'border-foreground bg-foreground text-background'
                  : 'bg-background hover:border-primary hover:text-primary',
              )}
            >
              {tab.label}
              {/* The counts are a second request. Until it lands - or for good,
                  if it fails while the list succeeds - the tab is just its
                  label: a badge short of a number still filters, and a strip
                  that waited for one would hold up a list that had arrived. */}
              {count !== undefined && (
                <>
                  {/* A space between the two text runs, or the tab is named
                      "Delivered1" to a screen reader. Flex drops a
                      whitespace-only item, so the 7px gap is still the gap. */}{' '}
                  <Badge
                    className={cn(
                      'border-0 bg-transparent p-0 text-xs font-semibold',
                      isActive ? 'text-background/65' : 'text-muted-foreground',
                    )}
                  >
                    {count}
                  </Badge>
                </>
              )}
            </button>
          )
        })}
      </div>

      {query.isLoading && (
        <div className="flex flex-col gap-3.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[220px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">Couldn't load your orders</p>
          <p className="text-sm text-muted-foreground">
            {query.error?.detail ?? 'Something went wrong. Try again.'}
          </p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {query.isSuccess && orders.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">No orders here</p>
          <p className="text-sm text-muted-foreground">
            {q || group !== 'all'
              ? 'Try a different search or filter.'
              : 'Once you buy something it shows up here.'}
          </p>
          <Button variant="outline" asChild>
            <Link to="/search">Start shopping</Link>
          </Button>
        </div>
      )}

      {orders.length > 0 && (
        <div className="flex flex-col gap-3.5">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isOpen={openId === order.id}
              onToggle={() => setOpenId((current) => (current === order.id ? null : order.id))}
            />
          ))}
        </div>
      )}

      {/* Shown whenever there are orders, not only past page one: Per page is
          how you get back from 50 to 5, and at 50 there is often one page. */}
      {orders.length > 0 && (
        <PaginationBar
          className="pt-6"
          page={shownPage}
          totalPages={totalPages}
          onPageChange={(next) => patch({ page: String(next) })}
          range={{
            totalElements: total,
            pageSize: size,
            sizes: PAGE_SIZES,
            unit: 'orders',
            // A new page size makes the old offset meaningless, so patch drops
            // ?page= with it - as it does for any other filter change.
            onSizeChange: (next) =>
              patch({ size: next === DEFAULT_SIZE ? undefined : String(next) }),
          }}
        />
      )}
    </div>
  )
}
