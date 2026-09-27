import { ChevronRight, Search, Store } from 'lucide-react'
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
import { useOpenRefundCount } from '@/features/orders/api/useOpenRefundCount'
import { OrderCard } from '@/features/orders/components/OrderCard'
import {
  DEFAULT_PERIOD,
  normalisePeriod,
  periodOptions,
  periodPhrase,
  periodRange,
} from '@/features/orders/orderPeriod'
import { useViewerRole } from '@/features/session/api/useViewerRole'
import { useRecordDrawer } from '@/lib/recordDrawer'
import { cn } from '@/lib/utils'

const TABS: { value: BuyerOrderGroup; label: string }[] = [
  { value: 'all', label: 'All orders' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'refunds', label: 'Refunds & returns' },
]

/**
 * The page sizes a ?size= may ask for, and the one the list opens on. The design
 * offers no Per page control on this screen - unlike the seller lists - so these
 * only ever come from the URL.
 */
const PAGE_SIZES = [5, 10, 20, 50] as const
const DEFAULT_SIZE = 10

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

/** Shared by the orders list and the seller notice that stands in for it. */
function OrdersBreadcrumb() {
  return (
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
  )
}

/**
 * "6 orders on file · 2 refunds in progress" - the whole history, not this view.
 *
 * `openRefunds` is null where the refund count could not be had at all: the refund
 * endpoint is not served yet, and half a sentence about the buyer's refunds is
 * better than either a number nothing answered for or a line that never arrives.
 */
function summaryLine(orders: number, openRefunds: number | null) {
  const left = `${orders} order${orders === 1 ? '' : 's'} on file`
  if (openRefunds === null) return left
  const right = openRefunds
    ? `${openRefunds} refund${openRefunds === 1 ? '' : 's'} in progress`
    : 'no open refunds'
  return `${left} · ${right}`
}

export function MyOrders() {
  // A seller has no buyer order history. Firing the request anyway returned a
  // 401 that this page printed as "Session is missing, expired, or invalid" -
  // about a session that was valid, just not a buyer's.
  const viewer = useViewerRole()
  const isSeller = viewer.role === 'seller'
  const [searchParams, setSearchParams] = useSearchParams()
  // Which order is expanded lives in the URL, like every other record drawer in the
  // app (lib/recordDrawer): a refresh, a shared link and Back all reopen the same
  // card. `mode` is always view here - a buyer's order card has no other mode.
  const drawer = useRecordDrawer()

  const group = (searchParams.get('group') as BuyerOrderGroup | null) ?? 'all'
  const q = searchParams.get('q') ?? ''
  // The four windows are derived from today, so the select cannot offer a year
  // that has not happened; anything else in ?period= is not a window at all.
  const periods = useMemo(() => periodOptions(), [])
  const period = normalisePeriod(searchParams.get('period'))
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
      ...periodRange(period),
      page,
      size,
    }),
    [group, q, period, page, size],
  )

  // Held until the session has answered, so a seller loading /orders directly
  // does not fire the doomed request in the gap before their role is known.
  const ordersEnabled = !viewer.isPending && !isSeller
  const query = useBuyerOrders(filters, { enabled: ordersEnabled })
  // The same window the list is showing, spelled the way each endpoint takes
  // it: the same `from`/`to` dates for both. The counts used to take their own
  // `period` token, which meant the client and the server each decided what
  // "past 3 months" was - a tab could count a window the list it opened did
  // not use. No
  // `group` - the strip describes every bucket, so narrowing the counts by the
  // tab being viewed would zero the other three.
  const facets = useBuyerOrderFacets({ q: q || undefined, ...periodRange(period) }, { enabled: ordersEnabled })
  // The header line counts the buyer's whole history, which no filtered request
  // answers: same endpoint, no window and no search term.
  const onFile = useBuyerOrderFacets({}, { enabled: ordersEnabled })
  const openRefunds = useOpenRefundCount({ enabled: ordersEnabled })

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

  /**
   * What the empty state's button does: every filter back to how it opens.
   *
   * The drawer's own parameters go too, in the SAME write - the reader is asking for a
   * clean slate, and two setSearchParams calls in one tick would fight over which
   * version of the query string wins.
   */
  function showAllOrders() {
    setTerm('')
    patch({
      group: undefined,
      q: undefined,
      period: undefined,
      page: undefined,
      size: undefined,
      id: undefined,
      mode: undefined,
    })
  }

  const orders = query.data?.content ?? []
  const total = query.data?.totalElements ?? 0
  const totalPages = query.data?.totalPages ?? 1
  // A ?page= past the end comes back empty; don't also print a page number that
  // doesn't exist, and let Previous walk back into the range that does.
  const shownPage = Math.min(page, totalPages - 1)
  // Disabled queries never report isLoading, so the wait for the session is
  // part of the page's own loading state rather than a blank body.
  const isLoading = viewer.isPending || query.isLoading
  // The tab counts are scoped to the window and the search term, which is also
  // what the result line counts when nothing has been typed.
  const inWindow = facets.data?.get('all')
  const ordersOnFile = onFile.data?.get('all')
  // null, not undefined, once the refund count has failed: undefined still means
  // "waiting", and the header would wait for it forever.
  const refundCount = openRefunds.isError ? null : openRefunds.count

  const resultLine = isLoading
    ? 'Loading…'
    : q
      ? `${total} order${total === 1 ? '' : 's'} match${total === 1 ? 'es' : ''} “${q}”`
      : inWindow === undefined
        ? null
        : `${inWindow} order${inWindow === 1 ? '' : 's'} in ${periodPhrase(period)}`

  if (isSeller) {
    return (
      <div className="mx-auto w-full max-w-[1320px] flex-1 px-7 pt-5 pb-[72px]">
        <OrdersBreadcrumb />
        <h1 className="text-[28px] leading-[1.2] font-bold tracking-[-0.01em]">Your orders</h1>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">This page is for buyer orders</p>
          <p className="max-w-[420px] text-sm text-muted-foreground">
            You're signed in as a seller. The orders buyers have placed with you live in the
            seller portal.
          </p>
          <Button variant="outline" asChild>
            <Link to="/seller/orders">
              <Store className="size-4" aria-hidden />
              Go to seller orders
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] flex-1 px-7 pt-5 pb-[72px]">
      <OrdersBreadcrumb />

      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-[1.2] font-bold tracking-[-0.01em]">Your orders</h1>
          {/* Two counts from two requests. A skeleton rather than a guess while
              they land: the line is about the buyer's whole history, so half of
              it would be a number that then changed. If the order count itself
              cannot be had there is no line to write; if only the refund count
              fails, the line is written without it. */}
          {ordersOnFile !== undefined && refundCount !== undefined ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {summaryLine(ordersOnFile, refundCount)}
            </p>
          ) : (
            !onFile.isError && <Skeleton className="mt-1.5 h-[21px] w-[230px]" />
          )}
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
        <Select
          value={period}
          onValueChange={(value) =>
            patch({ period: value === DEFAULT_PERIOD ? undefined : value })
          }
        >
          <SelectTrigger
            aria-label="Filter by date"
            className="h-10 rounded-full px-3.5 text-[13px] font-semibold"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {resultLine && <p className="ml-auto text-[13px] text-muted-foreground">{resultLine}</p>}
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

      {isLoading && (
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
        <div className="rounded-xl border border-dashed px-5 py-16 text-center">
          <p className="font-bold">No orders here</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {q
              ? `Nothing matches “${q}” in this date range.`
              : 'Try a different filter or date range.'}
          </p>
          {/* Not "Start shopping": what is empty here is a filtered view, and
              the way out of one is to drop the filters, not to leave the page. */}
          <Button
            variant="outline"
            onClick={showAllOrders}
            className="mt-3.5 h-auto rounded-full px-[18px] py-[9px] text-[13px] hover:border-primary hover:bg-background hover:text-primary"
          >
            Show all orders
          </Button>
        </div>
      )}

      {orders.length > 0 && (
        <div className="flex flex-col gap-3.5">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isOpen={drawer.recordId === order.id}
              onToggle={() =>
                drawer.recordId === order.id ? drawer.close() : drawer.open(order.id)
              }
            />
          ))}
        </div>
      )}

      {/* Only where there is a second page to reach. With no Per page control on
          this screen, a one-page list has nothing for a pager to do. */}
      {orders.length > 0 && totalPages > 1 && (
        <PaginationBar
          className="pt-6"
          page={shownPage}
          totalPages={totalPages}
          onPageChange={(next) => patch({ page: String(next) })}
          range={{ totalElements: total, pageSize: size, unit: 'orders' }}
        />
      )}
    </div>
  )
}
