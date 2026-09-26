import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
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

const PAGE_SIZE = 10

/** The period select narrows the window; the server takes plain dates. */
function periodStart(period: Period): string | undefined {
  if (period === 'all') return undefined
  const now = new Date()
  const days = period === '30d' ? 30 : period === '6m' ? 183 : 365
  now.setDate(now.getDate() - days)
  return now.toISOString().slice(0, 10)
}

export function MyOrders() {
  const session = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(null)

  const group = (searchParams.get('group') as BuyerOrderGroup | null) ?? 'all'
  const q = searchParams.get('q') ?? ''
  const period = (searchParams.get('period') as Period | null) ?? '12m'
  const page = Number(searchParams.get('page') ?? 0)

  const filters = useMemo<BuyerOrderFilters>(
    () => ({
      group,
      q: q || undefined,
      from: periodStart(period),
      page,
      size: PAGE_SIZE,
    }),
    [group, q, period, page],
  )

  const query = useBuyerOrders(filters)

  function patch(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    // Any filter change starts from the first page again.
    if (!('page' in next)) params.delete('page')
    setSearchParams(params)
  }

  const orders = query.data?.content ?? []
  const total = query.data?.totalElements ?? 0
  const totalPages = query.data?.totalPages ?? 1

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
            defaultValue={q}
            onChange={(e) => patch({ q: e.target.value })}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => patch({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => patch({ page: String(page + 1) })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
