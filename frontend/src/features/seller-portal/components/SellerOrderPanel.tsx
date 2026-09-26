import { Check, RotateCcw, Truck } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatAddressLines } from '@/features/orders/components/formatAddress'
import {
  useSellerOrderRow,
  useUpdateSellerOrder,
  type UpdateSellerOrder,
} from '@/features/seller-portal/api/useSellerCatalog'
import { formatMediumDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'
import { cn } from '@/lib/utils'

import { StatusBadge } from './StatusBadge'

type Stage = 'PACKED' | 'SHIPPED'

const HANDOVER_METHODS = [
  { value: 'AMEZO_PICKUP', label: 'Amezo pickup from your address' },
  { value: 'HUB_DROPOFF', label: 'Dropped at an Amezo hub' },
  { value: 'LOCKER_DROP', label: 'Left in an Amezo locker' },
] as const

const HUBS = ['PDX-1 · Portland Airway', 'PDX-2 · Swan Island', 'SEA-4 · Kent Valley']

/** What the seller may do from where the order currently is. */
function availability(status: string): Record<Stage, { allowed: boolean; reason?: string }> {
  return {
    PACKED: {
      allowed: status === 'PLACED',
      reason: status === 'PLACED' ? undefined : 'Already packed',
    },
    SHIPPED: {
      allowed: status === 'PLACED' || status === 'PACKED',
      reason: status === 'PLACED' || status === 'PACKED' ? undefined : 'Already handed over',
    },
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

/**
 * One order's fulfilment view. Rendered by the orders list in a drawer and by
 * the standalone route the drawer's "full page" button opens, so both show the
 * same log and the same compose box.
 *
 * The seller owns packing and handover only. Transit and delivery come from the
 * carrier, so those stages are not offered here - which is also why the tracking
 * number is displayed rather than typed: it is issued on handover.
 */
export function SellerOrderPanel({ orderId }: { orderId: string }) {
  const query = useSellerOrderRow(orderId)
  const update = useUpdateSellerOrder(orderId)

  const [stage, setStage] = useState<Stage>('PACKED')
  const [parcels, setParcels] = useState('1')
  const [packedBy, setPackedBy] = useState('')
  const [handoverMethod, setHandoverMethod] =
    useState<(typeof HANDOVER_METHODS)[number]['value']>('AMEZO_PICKUP')
  const [hub, setHub] = useState(HUBS[0])
  const [note, setNote] = useState('')

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
        <p className="font-medium">Couldn't load this order</p>
        <p className="text-sm text-muted-foreground">
          {query.error?.detail ?? 'Something went wrong. Try again.'}
        </p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const order = query.data
  const can = availability(order.status)
  const stageAllowed = can[stage].allowed
  const isFinal = !can.PACKED.allowed && !can.SHIPPED.allowed

  function post() {
    const body: UpdateSellerOrder =
      stage === 'PACKED'
        ? {
            status: 'PACKED',
            parcels: Math.max(1, Number(parcels) || 1),
            packedBy: packedBy.trim() || undefined,
            note: note.trim() || undefined,
          }
        : {
            status: 'SHIPPED',
            handoverMethod,
            hub,
            note: note.trim() || undefined,
          }
    update.mutate(body, { onSuccess: () => setNote('') })
  }

  const log = [
    { code: 'PLACED', label: 'Order placed', at: order.placedAt, done: true },
    { code: 'PACKED', label: 'Packed', at: order.packedAt, done: Boolean(order.packedAt) },
    {
      code: 'SHIPPED',
      label: 'Handed over',
      at: order.shipment?.trackingNumber ? order.placedAt : null,
      done: ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status),
    },
    {
      code: 'DELIVERED',
      label: 'Delivered',
      at: order.shipment?.deliveredAt,
      done: order.status === 'DELIVERED',
    },
  ]

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={order.status} />
        <span className="font-mono text-xs text-muted-foreground">{order.reference}</span>
        <span className="ml-auto text-sm font-semibold tabular-nums">
          {formatPrice(order.total)}
        </span>
      </div>

      <section>
        <SectionLabel>Fulfilment log</SectionLabel>
        <ol className="mt-3 flex flex-col">
          {log.map((entry, index) => (
            <li key={entry.code} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex size-[22px] shrink-0 items-center justify-center rounded-full',
                    entry.done ? 'bg-primary text-primary-foreground' : 'border-2 bg-background',
                  )}
                >
                  {entry.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                {index < log.length - 1 && (
                  <span className={cn('w-0.5 flex-1', entry.done ? 'bg-primary' : 'bg-border')} />
                )}
              </div>
              <div className="pb-5">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    !entry.done && 'text-muted-foreground',
                  )}
                >
                  {entry.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {entry.at ? formatMediumDate(entry.at) : 'Not yet'}
                </p>
                {entry.code === 'DELIVERED' && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Truck className="size-3" aria-hidden />
                    Reported by Amezo Logistics
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {!isFinal && (
        <section className="rounded-xl border p-5">
          <SectionLabel>Add an update</SectionLabel>
          <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground text-pretty">
            You own packing and handover. Transit and delivery are reported by Amezo Logistics once
            the parcel is scanned in.
          </p>

          <div className="mt-3.5 flex flex-wrap gap-2">
            {(['PACKED', 'SHIPPED'] as Stage[]).map((option) => {
              const state = can[option]
              return (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={stage === option ? 'default' : 'outline'}
                  disabled={!state.allowed}
                  title={state.reason}
                  onClick={() => setStage(option)}
                >
                  {option === 'PACKED' ? 'Packed' : 'Handed over'}
                </Button>
              )
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {stage === 'PACKED' ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="op-parcels">Parcels</Label>
                  <Input
                    id="op-parcels"
                    inputMode="numeric"
                    value={parcels}
                    onChange={(e) => setParcels(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="op-packer">
                    Packed by <span className="text-muted-foreground">Optional</span>
                  </Label>
                  <Input
                    id="op-packer"
                    value={packedBy}
                    onChange={(e) => setPackedBy(e.target.value)}
                    placeholder="Warehouse team"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="op-method">Handover method</Label>
                  <Select
                    value={handoverMethod}
                    onValueChange={(value) =>
                      setHandoverMethod(value as (typeof HANDOVER_METHODS)[number]['value'])
                    }
                  >
                    <SelectTrigger id="op-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HANDOVER_METHODS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="op-hub">Warehouse</Label>
                  <Select value={hub} onValueChange={setHub}>
                    <SelectTrigger id="op-hub">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HUBS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    Tracking number is issued by Amezo on handover.
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="op-note">
              Note to the buyer <span className="text-muted-foreground">Optional</span>
            </Label>
            <Textarea
              id="op-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the buyer should know"
            />
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <Button disabled={!stageAllowed || update.isPending} onClick={post}>
              {update.isPending
                ? 'Posting…'
                : stage === 'PACKED'
                  ? 'Mark as packed'
                  : 'Mark as handed over'}
            </Button>
            <p className="text-xs text-muted-foreground">
              {stageAllowed ? 'The buyer sees this on their order' : can[stage].reason}
            </p>
          </div>

          {update.isError && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {update.error?.detail ?? "That update couldn't be posted."}
            </p>
          )}
        </section>
      )}

      <section>
        <SectionLabel>Items</SectionLabel>
        <div className="mt-3 overflow-hidden rounded-lg border">
          {order.lines.map((line) => (
            <div key={line.id} className="flex flex-wrap items-center gap-3 border-b p-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{line.productTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {line.variantLabel}
                  {line.sku ? ` · ${line.sku}` : ''}
                </p>
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">× {line.quantity}</span>
              <span className="min-w-[72px] text-right text-sm font-semibold tabular-nums">
                {formatPrice(line.lineTotal)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-6">
        <div className="min-w-[180px] flex-1">
          <SectionLabel>Ship to</SectionLabel>
          <p className="mt-2 text-[13px] leading-[1.55] whitespace-pre-line text-muted-foreground">
            {formatAddressLines(order.shippingAddress).join('\n')}
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">{order.buyerEmail}</p>
        </div>
        <div className="min-w-[160px] flex-1">
          <SectionLabel>Totals</SectionLabel>
          <div className="mt-2 flex flex-col gap-1 text-[13px]">
            {[
              { label: 'Items', value: formatPrice(order.subtotal) },
              { label: 'Shipping', value: order.shipping === 0 ? 'Free' : formatPrice(order.shipping) },
              { label: 'Total', value: formatPrice(order.total) },
            ].map((row) => (
              <div key={row.label} className="flex justify-between gap-3 text-muted-foreground">
                <span>{row.label}</span>
                <span className="tabular-nums text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {(order.refundRequests ?? []).length > 0 && (
        <section className="rounded-xl border border-primary/35 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="size-4 text-primary" aria-hidden />
            <p className="text-sm font-semibold">This order has a refund request</p>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Handle it from the Refunds screen.
          </p>
        </section>
      )}
    </div>
  )
}
