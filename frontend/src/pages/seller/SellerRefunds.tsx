import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { PaginationBar } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableAction,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useSellerRefundRequests,
  type RefundStatus,
  type SellerRefundFilters,
} from '@/features/refunds/api/useRefundRequests'
import { RefundDecisionPanel } from '@/features/refunds/components/RefundDecisionPanel'
import { useSellerRefundFacets } from '@/features/seller-portal/api/useSellerFacets'
import {
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerSubline,
  DrawerTitle,
} from '@/features/seller-portal/components/Drawer'
import { FacetTabs } from '@/features/seller-portal/components/FacetTabs'
import { StatusBadge } from '@/features/seller-portal/components/StatusBadge'
import { formatMediumDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'
import { useRecordDrawer, useRecordSnapshot } from '@/lib/recordDrawer'

const PAGE_SIZES = [5, 10, 20, 50] as const
const DEFAULT_PAGE_SIZE = 10

/**
 * The design opens on what needs a decision, not on everything. Each value is a
 * RefundStatus, which is both what ?status= takes and what the facets endpoint keys
 * its counts by - so a tab needs no translation to become either.
 *
 * APPROVED and REPLACEMENT_SENT are here and were not before. A replacement is
 * approved into APPROVED rather than into AWAITING_RETURN - there is nothing to wait
 * for - and without tabs for those two a replacement request was reachable only
 * through "All", which is not where a seller looks for work.
 *
 * CANCELLED has no tab, matching the endpoint's own buckets: the buyer withdrew it
 * and there is nothing for the seller to do. It is still counted under All.
 */
const TABS: { value: string; label: string }[] = [
  { value: 'REQUESTED', label: 'Needs a decision' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'AWAITING_RETURN', label: 'Awaiting return' },
  { value: 'RETURN_RECEIVED', label: 'Return received' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'REPLACEMENT_SENT', label: 'Replacement sent' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'all', label: 'All' },
]

/** The statuses that still want something from the seller - the design's "Review". */
const NEEDS_ACTION: readonly RefundStatus[] = [
  'REQUESTED',
  'APPROVED',
  'AWAITING_RETURN',
  'RETURN_RECEIVED',
]

/**
 * ?page=abc, ?page=-5 and ?page=1.7 used to go straight into the request and into
 * "Page NaN of 1". A page number is a whole one, zero or above, or it is 0.
 */
function pageParam(raw: string | null) {
  const parsed = Number(raw ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

/** Same for ?size=: one of the four the selector offers, or the default. */
function sizeParam(raw: string | null) {
  const parsed = Number(raw)
  return PAGE_SIZES.includes(parsed as (typeof PAGE_SIZES)[number]) ? parsed : DEFAULT_PAGE_SIZE
}

export function SellerRefunds() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Which request is open, and in what mode, lives in the URL - see lib/recordDrawer.
  const drawer = useRecordDrawer()

  const status = searchParams.get('status') ?? 'REQUESTED'
  const q = searchParams.get('q') ?? ''
  const page = pageParam(searchParams.get('page'))
  const size = sizeParam(searchParams.get('size'))

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
      size,
    }),
    [status, q, page, size],
  )

  const query = useSellerRefundRequests(filters)
  // A second request, on the search alone: the strip shows every bucket at
  // once, so narrowing it by the tab being viewed would zero the other seven.
  // Its failure costs the numbers and nothing else.
  const facetsQuery = useSellerRefundFacets(q || undefined)

  // `replace` swaps the current history entry instead of pushing a new one.
  function patch(next: Record<string, string | undefined>, replace = false) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    // Any other change - a tab, the search, the page size - starts again at
    // the first page.
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

  // The design's header line, verbatim: "3 waiting on you · $327 at stake". Drawn
  // from the facets, which count every bucket, where the line it replaces counted
  // only the tab being viewed. The money is real now - the endpoint sends a total
  // per bucket - so the sentence no longer has to stop at a count.
  const waitingFacet = facetsQuery.data?.find((facet) => facet.key === 'REQUESTED')
  const summary =
    waitingFacet !== undefined
      ? `${waitingFacet.count} waiting on you${
          waitingFacet.value != null ? ` · ${formatPrice(waitingFacet.value)} at stake` : ''
        }`
      : query.isLoading
        ? 'Loading…'
        : `${total} request${total === 1 ? '' : 's'}`

  // The row the drawer draws from, kept while the URL names it: settling a request
  // takes it out of the tab being viewed, and a drawer derived only from the current
  // page slammed shut the instant the decision succeeded.
  const openRow = useRecordSnapshot(drawer.recordId, rows)

  /**
   * Follow a request that has just moved into the tab it moved to.
   *
   * Keeping the drawer open was only half of it: the row itself left the list, so
   * closing the drawer left a seller staring at a queue with no sign of the refund
   * they had just approved. The tabs are a status filter and the screen opens on
   * "Needs a decision", which by definition is the one tab a decided request cannot
   * be in.
   *
   * Written to the URL, which is where the open tab lives, so Back still walks out of
   * it - and `replace`, because following the record is part of the decision the
   * seller just made rather than a navigation they would want to undo separately.
   * Nothing to do on "All", or when the new status is already in view.
   */
  function followStatus(next: RefundStatus) {
    if (status === 'all' || status === next) return
    patch({ status: next }, true)
  }

  return (
    // h-full, and every child but the table shrink-0: the shell hands this page a
    // definite height and owns the only scrollbar, so the table is the one thing
    // that gives way rather than the page growing past the window.
    <div className="flex h-full flex-col gap-5">
      <div className="shrink-0">
        <h1 className="text-xl font-bold">Refunds</h1>
        <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
      </div>

      <div className="shrink-0">
        <FacetTabs
          label="Filter refund requests by status"
          tabs={TABS}
          value={status}
          facets={facetsQuery.data}
          isPending={facetsQuery.isPending}
          onValueChange={(value) => patch({ status: value })}
        />
      </div>

      <div className="relative max-w-[360px] shrink-0">
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
        <div className="flex shrink-0 flex-col items-start gap-3 rounded-lg border p-6">
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
        <div className="flex shrink-0 flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {query.isSuccess && rows.length === 0 && (
        <div className="flex shrink-0 flex-col items-center gap-2 rounded-lg border py-16 text-center">
          <p className="font-medium">Nothing here</p>
          <p className="text-sm text-muted-foreground">No requests in this state right now.</p>
        </div>
      )}

      {/* The table and its pager are one container, as the design draws them: the
          rows scroll inside the border and the bar stays pinned to its bottom edge,
          so paging never means scrolling the page to find it. */}
      {rows.length > 0 && (
        <TableContainer
          fill
          footer={
            <PaginationBar
              page={shownPage}
              totalPages={totalPages}
              onPageChange={(next) => patch({ page: next === 0 ? undefined : String(next) })}
              range={{
                totalElements: total,
                pageSize: size,
                sizes: PAGE_SIZES,
                onSizeChange: (next) => patch({ size: String(next) }),
              }}
            />
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Wants</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const needsAction = NEEDS_ACTION.includes(row.status)
                return (
                  <TableRow
                    key={row.id}
                    // The whole row opens the record, as the design has it.
                    // Keyboard reaches the same thing through the action button,
                    // so this is a shortcut rather than the only way in.
                    onClick={() => drawer.open(row.id)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.reference}
                    </TableCell>
                    <TableCell>
                      {/* The design's two-line Buyer cell: who, then which order
                          and when. Both come off the summary now - a row that
                          could not name the buyer was a table of reference
                          codes. */}
                      <p className="max-w-[16rem] truncate font-medium">
                        {row.buyerName ?? row.buyerEmail ?? 'Buyer'}
                      </p>
                      <p className="max-w-[16rem] truncate text-xs text-muted-foreground">
                        Order {row.orderReference} · {formatMediumDate(row.requestedAt)}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-[13px] text-muted-foreground">
                      {row.items ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatPrice(row.approvedAmount ?? row.requestedAmount)}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {row.resolution === 'REPLACEMENT' ? 'Replacement' : 'Refund'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {/* The design's two verbs: Review while it still wants
                          something, View once it is settled. Stops propagation
                          so the row's own click does not also fire. */}
                      <TableAction
                        variant={needsAction ? 'default' : 'outline'}
                        onClick={(e) => {
                          e.stopPropagation()
                          drawer.open(row.id)
                        }}
                      >
                        {needsAction ? 'Review' : 'View'}
                      </TableAction>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* The shared Drawer, not the old DetailDrawer wrapper: the status pill goes
          in the header's own slot, the reference is the muted chip beside it, and
          "Full page" is a link to the dedicated route in a new tab - so the queue
          keeps its filter, page and scroll position behind it. */}
      <Drawer
        open={drawer.isOpen}
        onOpenChange={(next) => {
          if (!next) drawer.close()
        }}
        ariaLabel="Refund request"
        // 560 is the design's panel width for this screen, wider than the 520 a
        // product record reads at: the decision body holds a segmented control, an
        // amount field and a message box side by side.
        width={560}
        fullPageTo={openRow ? `/seller/refunds/${openRow.id}` : undefined}
      >
        {openRow && (
          <>
            <DrawerHeader
              status={<StatusBadge status={openRow.status} />}
              meta={<span className="font-mono">{openRow.reference}</span>}
            >
              <DrawerTitle>{openRow.buyerName ?? openRow.buyerEmail ?? 'Refund request'}</DrawerTitle>
              <DrawerSubline>
                Order {openRow.orderReference} · requested {formatMediumDate(openRow.requestedAt)}
                {openRow.buyerEmail ? ` · ${openRow.buyerEmail}` : ''}
              </DrawerSubline>
            </DrawerHeader>
            <DrawerBody>
              {/* The header above already carries the status pill and the
                  reference, so the panel does not draw its own. */}
              <RefundDecisionPanel
                refundRequestId={openRow.id}
                showIdentity={false}
                onStatusChange={followStatus}
              />
            </DrawerBody>
          </>
        )}
      </Drawer>
    </div>
  )
}
