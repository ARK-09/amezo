import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBuyerOrder } from '@/features/orders/api/useBuyerOrders'
import {
  isRefundOpen,
  refundStepsFor,
  refundSummaryLine,
  refundTitleFor,
} from '@/features/refunds/refundProgress'
import { formatPrice } from '@/lib/formatPrice'
import { formatShortDate } from '@/lib/formatDate'

import { formatAddressLines } from './formatAddress'
import { OrderReviews } from './OrderReviews'
import { ProgressSteps, type ProgressStep } from './ProgressSteps'
import { SectionLabel } from './SectionLabel'

/**
 * The expanded half of an order card. Kept in its own component because it is
 * the only thing that needs the full order: the list endpoint returns a summary,
 * so opening a card is what fetches lines, totals and the delivery timeline.
 */
export function OrderCardDetail({ orderId }: { orderId: string }) {
  const query = useBuyerOrder(orderId)

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3 border-t bg-[#fcfcfc] p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t bg-[#fcfcfc] p-5">
        <p className="text-sm text-muted-foreground">
          {query.error?.detail ?? "Couldn't load this order."}
        </p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const order = query.data
  const deliverySteps: ProgressStep[] = order.timeline.map((entry) => ({
    key: entry.code,
    label: entry.label,
    detail: entry.at ? `${entry.estimated ? 'Est. ' : ''}${formatShortDate(entry.at)}` : entry.detail,
    state: entry.completed ? 'done' : 'todo',
  }))

  const totals = [
    { label: 'Items', value: formatPrice(order.subtotal) },
    { label: 'Shipping', value: order.shipping === 0 ? 'Free' : formatPrice(order.shipping) },
    { label: 'Tax', value: formatPrice(order.tax) },
    { label: 'Total', value: formatPrice(order.total) },
  ]

  return (
    <div className="border-t bg-[#fcfcfc] p-5">
      <SectionLabel>Delivery</SectionLabel>
      <div className="mt-3.5 mb-2">
        <ProgressSteps steps={deliverySteps} />
      </div>

      {(order.refundRequests ?? []).map((refund) => (
        <div
          key={refund.id}
          className="mt-[22px] rounded-xl border border-primary/35 bg-primary/5 p-[18px]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <h3 className="text-[15px] font-bold">{refundTitleFor(refund)}</h3>
            <span className="font-mono text-xs text-muted-foreground">{refund.reference}</span>
          </div>
          <p className="mt-1.5 text-sm leading-[1.55] text-[#4a4a4a] text-pretty">
            {refundSummaryLine(refund)}
          </p>
          <div className="mt-[18px]">
            <ProgressSteps steps={refundStepsFor(refund)} />
          </div>
        </div>
      ))}

      <div className="mt-[22px] mb-2.5">
        <SectionLabel>Items</SectionLabel>
      </div>
      <div className="overflow-hidden rounded-[10px] border bg-background">
        {order.lines.map((line) => (
          <div key={line.id} className="flex flex-wrap items-center gap-3 border-b p-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {line.thumbnailUrl ? (
                <img src={line.thumbnailUrl} alt="" className="size-full object-cover" />
              ) : (
                <RotateCcw className="size-4 text-muted-foreground opacity-0" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1 basis-[220px]">
              <p className="text-sm font-semibold text-pretty">{line.productTitle}</p>
              <p className="mt-[3px] text-[13px] text-muted-foreground">
                {line.variantLabel} · qty {line.quantity}
              </p>
            </div>
            {line.refundStatus && isRefundOpen(line.refundStatus) && (
              <span className="rounded-full bg-primary/10 px-2.5 py-[3px] text-[11px] font-bold text-[#b8560a]">
                In refund
              </span>
            )}
            <span className="min-w-[72px] text-right text-sm font-semibold tabular-nums">
              {formatPrice(line.lineTotal)}
            </span>
          </div>
        ))}

        <div className="flex flex-wrap gap-5 p-3.5">
          <div className="min-w-0 flex-1 basis-[200px]">
            <p className="mb-1 text-xs font-bold tracking-[0.05em] text-muted-foreground uppercase">
              Shipped to
            </p>
            <p className="text-[13px] leading-[1.55] whitespace-pre-line text-[#4a4a4a]">
              {formatAddressLines(order.shippingAddress).join('\n')}
            </p>
          </div>
          {order.payment && (
            <div className="min-w-0 flex-1 basis-[180px]">
              <p className="mb-1 text-xs font-bold tracking-[0.05em] text-muted-foreground uppercase">
                Paid with
              </p>
              <p className="text-[13px] leading-[1.55] text-[#4a4a4a]">
                {order.payment.brand} ending {order.payment.last4}
              </p>
            </div>
          )}
          <div className="ml-auto min-w-[200px] flex-[0_1_240px]">
            {totals.map((row) => (
              <div
                key={row.label}
                className="flex justify-between gap-3 py-[3px] text-[13px] text-muted-foreground"
              >
                <span>{row.label}</span>
                <span className="tabular-nums text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviewing is offered once the order has arrived, which is also when the
          server starts accepting one. */}
      {order.status === 'DELIVERED' && <OrderReviews lines={order.lines} />}
    </div>
  )
}
