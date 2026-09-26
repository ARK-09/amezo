import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useSellerRefundRequests,
  type RefundStatus,
  type RefundRequestSummary,
  type SellerRefundFilters,
} from '@/features/refunds/api/useRefundRequests'
import { RefundDecisionPanel } from '@/features/refunds/components/RefundDecisionPanel'
import { DetailDrawer } from '@/features/seller-portal/components/DetailDrawer'
import { StatusBadge } from '@/features/seller-portal/components/StatusBadge'
import { formatMediumDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'

const PAGE_SIZE = 10

/** The design opens on what needs a decision, not on everything. */
const TABS: { value: string; label: string }[] = [
  { value: 'REQUESTED', label: 'Needs a decision' },
  { value: 'AWAITING_RETURN', label: 'Awaiting return' },
  { value: 'RETURN_RECEIVED', label: 'Return received' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'all', label: 'All' },
]

/**
 * ?page=abc, ?page=-5 and ?page=1.7 used to go straight into the request and
 * into "Page NaN of 1". A page number is a whole one, zero or above, or it is 0.
 */
function pageParam(raw: string | null) {
  const parsed = Number(raw ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

export function SellerRefunds() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(null)
  const [openSnapshot, setOpenSnapshot] = useState<RefundRequestSummary | null>(null)

  const status = searchParams.get('status') ?? 'REQUESTED'
  const q = searchParams.get('q') ?? ''
  const page = pageParam(searchParams.get('page'))

  // The box is controlled so it can never disagree with the list: a tab switch
  // or the Back button rewrites ?q= underneath it, and a defaultValue input
  // went on showing the term it was mounted with. Re-seeded during render
  // rather than from an effect - react(set-state-in-effect).
  const [term, setTerm] = useState(q)
  const [seededFrom, setSeededFrom] = useState(q)
  if (seededFrom !== q) {
    setSeededFrom(q)
    setTerm(q)
  }

  const filters = useMemo<SellerRefundFilters>(
    () => ({
      status: status === 'all' ? undefined : (status as RefundStatus),
      q: q || undefined,
      page,
      size: PAGE_SIZE,
    }),
    [status, q, page],
  )

  const query = useSellerRefundRequests(filters)

  // `replace` swaps the current history entry instead of pushing a new one.
  function patch(next: Record<string, string | undefined>, replace = false) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    if (!('page' in next)) params.delete('page')
    setSearchParams(params, { replace })
  }

  // A tab switch or a page is a navigation the seller may want to undo
  // with Back; a keystroke is not. The first character pushes the one entry that
  // Back escapes the search by, and every character after it replaces that entry
  // - typing "tanaka" used to leave six entries to press Back through.
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
  // Snapshotted when the drawer opens. Acting on a record usually moves it
  // out of the bucket being viewed - deriving the drawer from the current
  // page meant it slammed shut the instant the action succeeded, before the
  // seller saw the result.
  const openRow = rows.find((row) => row.id === openId) ?? openSnapshot

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">Refunds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {query.isLoading ? 'Loading…' : `${total} request${total === 1 ? '' : 's'}`}
        </p>
      </div>

      <Tabs value={status} onValueChange={(value) => patch({ status: value })}>
        <TabsList className="flex-wrap">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative max-w-[360px]">
        <Search
          className="absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={term}
          onChange={(e) => patchTerm(e.target.value)}
          placeholder="Search buyer, order or product"
          aria-label="Search refund requests"
          className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {query.isError && (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="font-medium">Couldn't load refund requests</p>
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
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {query.isSuccess && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border py-16 text-center">
          <p className="font-medium">Nothing waiting on a decision.</p>
          <p className="text-sm text-muted-foreground">
            Requests appear here as buyers raise them.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Wants</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                  <TableCell className="font-mono text-xs">{row.orderReference}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatMediumDate(row.requestedAt)}
                  </TableCell>
                  <TableCell>{row.resolution === 'REPLACEMENT' ? 'Replacement' : 'Refund'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(row.approvedAmount ?? row.requestedAmount)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => {
                        setOpenId(row.id)
                        setOpenSnapshot(row)
                      }}>
                      Review
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
        title={openRow ? `Request ${openRow.reference}` : 'Refund request'}
        description={openRow?.orderReference}
        fullPageTo={`/seller/refunds/${openRow?.id ?? ''}`}
      >
        {openRow && <RefundDecisionPanel refundRequestId={openRow.id} />}
      </DetailDrawer>
    </div>
  )
}
