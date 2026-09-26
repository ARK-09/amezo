import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useSellerOrderRows,
  type SellerOrderFilters,
  type SellerOrderRow,
} from '@/features/seller-portal/api/useSellerCatalog'
import { DetailDrawer } from '@/features/seller-portal/components/DetailDrawer'
import { SellerOrderPanel } from '@/features/seller-portal/components/SellerOrderPanel'
import { StatusBadge } from '@/features/seller-portal/components/StatusBadge'
import { formatMediumDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'

const PAGE_SIZE = 10

const STATUSES = [
  'PLACED',
  'PACKED',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'total_desc', label: 'Highest value' },
  { value: 'total_asc', label: 'Lowest value' },
] as const

/**
 * ?page=abc, ?page=-5 and ?page=1.7 used to go straight into the request and
 * into "Page NaN of 1". A page number is a whole one, zero or above, or it is 0.
 */
function pageParam(raw: string | null) {
  const parsed = Number(raw ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

export function SellerOrders() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(null)
  const [openSnapshot, setOpenSnapshot] = useState<SellerOrderRow | null>(null)

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? 'all'
  const sort = searchParams.get('sort') ?? 'newest'
  const page = pageParam(searchParams.get('page'))

  // The box is controlled so it can never disagree with the list: "Clear
  // filters" and the Back button both rewrite ?q= underneath it, and a
  // defaultValue input went on showing the term it was mounted with. Re-seeded
  // during render rather than from an effect - react(set-state-in-effect).
  const [term, setTerm] = useState(q)
  const [seededFrom, setSeededFrom] = useState(q)
  if (seededFrom !== q) {
    setSeededFrom(q)
    setTerm(q)
  }

  const filters = useMemo<SellerOrderFilters>(
    () => ({
      q: q || undefined,
      status: status === 'all' ? undefined : (status as SellerOrderFilters['status']),
      sort: sort as SellerOrderFilters['sort'],
      page,
      size: PAGE_SIZE,
    }),
    [q, status, sort, page],
  )

  const query = useSellerOrderRows(filters)

  // `replace` swaps the current history entry instead of pushing a new one.
  function patch(next: Record<string, string | undefined>, replace = false) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== 'all') params.set(key, value)
      else params.delete(key)
    }
    if (!('page' in next)) params.delete('page')
    setSearchParams(params, { replace })
  }

  // A filter, a sort or a page is a navigation the seller may want to undo
  // with Back; a keystroke is not. The first character pushes the one entry that
  // Back escapes the search by, and every character after it replaces that entry
  // - typing "jonas" used to leave five entries to press Back through.
  function patchTerm(value: string) {
    setTerm(value)
    patch({ q: value }, Boolean(q))
  }

  const rows = query.data?.content ?? []
  const total = query.data?.totalElements ?? 0
  const totalPages = query.data?.totalPages ?? 1
  // A ?page= past the end comes back empty; don't also print a page number that
  // doesn't exist, and let Previous walk back into the range that does.
  const shownPage = Math.min(page, totalPages - 1)
  const hasFilters = Boolean(q) || status !== 'all' || sort !== 'newest'
  // Snapshotted when the drawer opens. Acting on a record usually moves it
  // out of the bucket being viewed - deriving the drawer from the current
  // page meant it slammed shut the instant the action succeeded, before the
  // seller saw the result.
  const openRow = rows.find((row) => row.id === openId) ?? openSnapshot

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {query.isLoading ? 'Loading…' : `${total} order${total === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative max-w-[360px] min-w-[220px] flex-1">
          <Search
            className="absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={term}
            onChange={(e) => patchTerm(e.target.value)}
            placeholder="Search order, recipient or email"
            aria-label="Search orders"
            className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <Select value={status} onValueChange={(value) => patch({ status: value })}>
          <SelectTrigger aria-label="Filter by status" className="h-9 w-[170px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {option.charAt(0) + option.slice(1).toLowerCase().replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(value) => patch({ sort: value })}>
          <SelectTrigger aria-label="Sort orders" className="h-9 w-[160px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>
            Clear filters
          </Button>
        )}
      </div>

      {query.isError && (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="font-medium">Couldn't load your orders</p>
          <p className="text-sm text-muted-foreground">
            {query.error?.detail ?? 'Something went wrong. Try again.'}
          </p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {query.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {query.isSuccess && rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-center">
          <p className="font-medium">No orders here</p>
          <p className="text-sm text-muted-foreground">
            {hasFilters ? 'Try a different search or filter.' : 'Orders appear here as buyers place them.'}
          </p>
          {hasFilters && (
            <Button variant="outline" onClick={() => setSearchParams(new URLSearchParams())}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                  <TableCell>
                    <p className="font-medium">{row.recipientName}</p>
                    <p className="text-xs text-muted-foreground">{row.buyerEmail}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatMediumDate(row.placedAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.itemCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPrice(row.total)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={row.status} />
                      {row.hasOpenRefund && (
                        <StatusBadge status="REQUESTED" className="bg-primary/10 text-[#b8560a]" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => {
                        setOpenId(row.id)
                        setOpenSnapshot(row)
                      }}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
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
            size="sm"
            disabled={shownPage + 1 >= totalPages}
            onClick={() => patch({ page: String(shownPage + 1) })}
          >
            Next
          </Button>
        </div>
      )}

      <DetailDrawer
        open={Boolean(openId)}
        onOpenChange={(next) => {
          if (next) return
          setOpenId(null)
          setOpenSnapshot(null)
        }}
        title={openRow ? `Order ${openRow.reference}` : 'Order'}
        description={openRow?.recipientName}
        fullPageTo={`/seller/orders/${openRow?.id ?? ''}`}
      >
        {openRow && <SellerOrderPanel orderId={openRow.id} />}
      </DetailDrawer>
    </div>
  )
}
