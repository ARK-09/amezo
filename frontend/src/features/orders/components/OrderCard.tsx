import { Check, ChevronDown, ImageIcon, RotateCcw, Star, Truck } from 'lucide-react'
import { Link } from 'react-router'

import { refundBadgeLabel } from '@/features/refunds/refundProgress'
import { formatDeliveryDate, formatMediumDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'
import { cn } from '@/lib/utils'

import type { BuyerOrderSummary } from '../api/useBuyerOrders'
import { OrderCardDetail } from './OrderCardDetail'

const PILL =
  'inline-flex items-center gap-[7px] rounded-full border px-3.5 py-[7px] text-[13px] font-semibold transition-colors hover:border-primary hover:text-primary'

function headlineFor(order: BuyerOrderSummary) {
  if (order.status === 'CANCELLED') {
    return { tone: 'cancelled' as const, text: 'Cancelled' }
  }
  if (order.status === 'DELIVERED') {
    return {
      tone: 'delivered' as const,
      text: `Delivered ${formatMediumDate(order.shipment?.deliveredAt)}`,
    }
  }
  const eta = order.shipment?.estimatedDeliveryAt
  return {
    tone: 'moving' as const,
    text: eta ? `Arriving ${formatDeliveryDate(eta)}` : 'Preparing your order',
  }
}

export function OrderCard({
  order,
  isOpen,
  onToggle,
}: {
  order: BuyerOrderSummary
  isOpen: boolean
  onToggle: () => void
}) {
  const headline = headlineFor(order)
  const preview = order.previewLines ?? []
  const hiddenCount = order.itemCount - preview.length
  const isMoving = headline.tone === 'moving'
  const canRequestRefund = order.status === 'DELIVERED' && !order.openRefundRequestId

  return (
    <article className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b bg-[#fafafa] px-5 py-3.5">
        {[
          { label: 'Order placed', value: formatMediumDate(order.placedAt), width: 'min-w-[110px]' },
          { label: 'Total', value: formatPrice(order.total), width: 'min-w-[80px]' },
        ].map((cell) => (
          <div key={cell.label} className={cell.width}>
            <p className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
              {cell.label}
            </p>
            <p className="mt-[3px] text-[13px] font-semibold">{cell.value}</p>
          </div>
        ))}
        <div className="min-w-[140px]">
          <p className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
            Order
          </p>
          <p className="mt-[3px] font-mono text-[13px]">{order.reference}</p>
        </div>
        <div className="flex flex-1 justify-end gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3.5 py-[7px] text-[13px] font-semibold transition-colors hover:border-primary hover:text-primary"
          >
            {isOpen ? 'Hide details' : 'Order details'}
            <ChevronDown className={cn('size-[13px] transition-transform', isOpen && 'rotate-180')} />
          </button>
        </div>
      </div>

      <div className="px-5 py-[18px]">
        <div className="flex flex-wrap items-start justify-between gap-3.5">
          <div className="min-w-0 flex-1 basis-[320px]">
            <div className="flex flex-wrap items-center gap-[9px]">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-[17px] font-bold',
                  headline.tone === 'delivered' && 'text-[#16794c]',
                  headline.tone === 'cancelled' && 'text-[#b42318]',
                )}
              >
                {headline.tone === 'delivered' && <Check className="size-4" strokeWidth={2.6} />}
                {headline.tone === 'moving' && <Truck className="size-4 text-primary" />}
                {headline.text}
              </span>
            </div>
            <p className="mt-[5px] text-sm text-muted-foreground text-pretty">
              {order.shipment?.deliveryNote ??
                (order.shipment?.carrier
                  ? `${order.shipment.carrier}${order.shipment.trackingNumber ? ` · ${order.shipment.trackingNumber}` : ''}`
                  : `Sold by ${order.seller.name}`)}
            </p>
          </div>

          {order.openRefundRequestId && (
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex shrink-0 items-center gap-[7px] rounded-full border border-primary bg-primary/5 px-3.5 py-[7px] text-[13px] font-bold text-[#b8560a]"
            >
              <RotateCcw className="size-3.5" />
              {refundBadgeLabel('REQUESTED')}
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3.5">
          {preview.map((line) => (
            <div key={line.id} className="flex min-w-0 flex-1 basis-[260px] items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
                {line.thumbnailUrl ? (
                  <img src={line.thumbnailUrl} alt="" className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <Link
                  to={`/products/${line.productRef}`}
                  className="block text-sm leading-[1.35] font-semibold text-pretty hover:text-primary"
                >
                  {line.productTitle}
                </Link>
                <p className="mt-[3px] text-[13px] text-muted-foreground">
                  {line.variantLabel} · qty {line.quantity}
                </p>
              </div>
            </div>
          ))}
          {hiddenCount > 0 && (
            <p className="self-center text-[13px] font-semibold text-muted-foreground">
              +{hiddenCount} more item{hiddenCount === 1 ? '' : 's'}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isMoving && (
            <button
              type="button"
              onClick={onToggle}
              className="rounded-full bg-primary px-[18px] py-[9px] text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Track package
            </button>
          )}
          {order.status === 'DELIVERED' && preview[0] && (
            <Link to={`/products/${preview[0].productRef}?review=1`} className={PILL}>
              <Star className="size-3.5" strokeWidth={1.8} />
              Write a review
            </Link>
          )}
          {preview[0] && (
            <Link to={`/products/${preview[0].productRef}`} className={PILL}>
              Buy it again
            </Link>
          )}
          {canRequestRefund && (
            <Link to={`/orders/${order.id}/refund`} className={PILL}>
              Return or refund
            </Link>
          )}
        </div>
      </div>

      {isOpen && <OrderCardDetail orderId={order.id} />}
    </article>
  )
}
