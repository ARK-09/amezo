import { Check, Lock, ShoppingBag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useBuyerOrder } from '@/features/orders/api/useBuyerOrders'
import { ProgressSteps } from '@/features/orders/components/ProgressSteps'
import {
  useCreateRefundRequest,
  type RefundPayout,
  type RefundResolution,
} from '@/features/refunds/api/useRefundRequests'
import { ChoiceCard } from '@/features/refunds/components/ChoiceCard'
import { formatPrice } from '@/lib/formatPrice'
import { formatMediumDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'

/** The server enforces this too; the form just stops you wasting a round trip. */
const MIN_DETAIL = 20

function SectionHeading({ step, title }: { step: number; title: string }) {
  return (
    <h2 className="text-[15px] font-bold">
      {step} · {title}
    </h2>
  )
}

export function RefundRequest() {
  const { orderId } = useParams<{ orderId: string }>()
  const order = useBuyerOrder(orderId)
  const create = useCreateRefundRequest()

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [detail, setDetail] = useState('')
  const [resolution, setResolution] = useState<RefundResolution>('REFUND')
  const [payout, setPayout] = useState<RefundPayout>('ORIGINAL_PAYMENT')

  const lines = useMemo(() => order.data?.lines ?? [], [order.data])
  const chosen = lines.filter((line) => selected[line.id])
  const total = chosen.reduce((sum, line) => sum + line.lineTotal, 0)

  const detailOk = detail.trim().length >= MIN_DETAIL
  const wantsRefund = resolution === 'REFUND'
  const canSubmit = chosen.length > 0 && detailOk && !create.isPending

  const missing: string[] = []
  if (chosen.length === 0) missing.push('pick at least one item')
  if (!detailOk) missing.push('add a little more detail')

  if (order.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-7 py-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    )
  }

  if (order.isError || !order.data) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-3 px-7 py-20 text-center">
        <p className="font-medium">Couldn't load this order</p>
        <p className="text-sm text-muted-foreground">
          {order.error?.detail ?? 'Something went wrong. Try again.'}
        </p>
        <Button variant="outline" onClick={() => order.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  // The window and the one-open-request rule are the server's to decide, and it
  // says so on the order rather than leaving each screen to work it out.
  if (!order.data.canRequestRefund) {
    return <Navigate to="/orders" replace />
  }

  const detailedOrder = order.data
  const paymentLabel = detailedOrder.payment
    ? `${detailedOrder.payment.brand} ending ${detailedOrder.payment.last4}`
    : 'Your original payment method'

  function submit() {
    if (!canSubmit) return
    create.mutate({
      orderId: detailedOrder.id,
      lines: chosen.map((line) => ({ orderLineId: line.id, quantity: line.quantity })),
      resolution,
      payout: wantsRefund ? payout : null,
      detail: detail.trim(),
    })
  }

  if (create.isSuccess) {
    const sent = create.data
    return (
      <main className="mx-auto w-full max-w-[720px] px-7 py-12">
        <div className="rounded-2xl border bg-background p-8">
          <span className="flex size-11 items-center justify-center rounded-full bg-[#16794c] text-white">
            <Check className="size-[22px]" strokeWidth={2.4} />
          </span>
          <h1 className="mt-5 text-2xl font-bold">
            Request sent to {detailedOrder.seller.name}
          </h1>
          <p className="mt-2 text-sm leading-[1.6] text-muted-foreground text-pretty">
            {wantsRefund
              ? `You asked for ${formatPrice(total)} back on `
              : 'You asked for a replacement of '}
            {chosen.map((line) => `${line.quantity} × ${line.productTitle}`).join(' and ')}.
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{sent.reference}</p>

          <div className="mt-7">
            <ProgressSteps
              steps={[
                { key: 'sent', label: 'Request sent', detail: 'Waiting on the seller', state: 'done' },
                {
                  key: 'review',
                  label: 'Seller reviews it',
                  detail: 'Within 2 business days',
                  state: 'current',
                },
                {
                  key: 'post',
                  label: 'Post the item back',
                  detail: 'A prepaid label arrives by email once approved',
                  state: 'todo',
                },
                {
                  key: 'done',
                  label: wantsRefund ? 'Money released' : 'Replacement ships',
                  detail: wantsRefund
                    ? `Back to ${paymentLabel}, 3–5 days after it arrives`
                    : 'Sent as soon as the returned item arrives',
                  state: 'todo',
                },
              ]}
            />
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/orders">Back to your orders</Link>
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[720px] flex-wrap items-center justify-between gap-3 px-7 py-3.5">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Amezo home">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ShoppingBag className="size-[15px]" />
            </span>
            <span className="text-[15px] font-bold">Amezo</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden />
            Secure link
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] flex-1 px-7 py-8">
        <h1 className="text-2xl font-bold">Request a refund</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Order {detailedOrder.reference} · placed {formatMediumDate(detailedOrder.placedAt)} · sold
          by {detailedOrder.seller.name}
        </p>

        <section className="mt-6 rounded-2xl border bg-background p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionHeading step={1} title="Which items?" />
            <span className="text-[13px] text-muted-foreground">
              {chosen.length === 0
                ? 'Nothing selected'
                : `${chosen.length} of ${lines.length} items · ${formatPrice(total)}`}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Pick only what you want to send back.
          </p>

          <div className="mt-4 flex flex-col gap-2.5">
            {lines.map((line) => {
              const isSelected = Boolean(selected[line.id])
              return (
                <label
                  key={line.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors',
                    isSelected ? 'border-primary bg-primary/5' : 'hover:border-neutral-300',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(next) =>
                      setSelected((current) => ({ ...current, [line.id]: next === true }))
                    }
                    aria-label={line.productTitle}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-pretty">
                      {line.productTitle}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">
                      {line.variantLabel} · qty {line.quantity} · {formatPrice(line.unitPrice)} each
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatPrice(line.lineTotal)}
                  </span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border bg-background p-6">
          <SectionHeading step={2} title="What went wrong?" />
          <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground text-pretty">
            The seller reads this, so detail helps: what happened, when you noticed, and what state
            the item is in.
          </p>
          <Textarea
            rows={5}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            aria-label="What went wrong"
            placeholder="The left earcup stopped producing sound about a week after delivery. Everything else works and the box and cable are intact."
            className="mt-3.5"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {detailOk
              ? `${detail.trim().length} characters`
              : `At least ${MIN_DETAIL} characters so the seller can act on it (${detail.trim().length}/${MIN_DETAIL})`}
          </p>
        </section>

        <section className="mt-4 rounded-2xl border bg-background p-6">
          <SectionHeading step={3} title="What would you prefer?" />
          <RadioGroup
            value={resolution}
            onValueChange={(value) => setResolution(value as RefundResolution)}
            className="mt-3.5 flex flex-wrap gap-2.5"
          >
            <ChoiceCard
              value="REFUND"
              label="Refund"
              detail="Money back to your original payment method once the item arrives."
              selected={wantsRefund}
            />
            <ChoiceCard
              value="REPLACEMENT"
              label="Replacement"
              detail={`${detailedOrder.seller.name} ships the same item again at no cost.`}
              selected={!wantsRefund}
            />
          </RadioGroup>
        </section>

        {wantsRefund && (
          <section className="mt-4 rounded-2xl border bg-background p-6">
            <SectionHeading step={4} title="Where the money goes" />
            <p className="mt-1 text-[13px] text-muted-foreground">
              Refunds go back to the method you paid with. Confirm it is still active.
            </p>
            <RadioGroup
              value={payout}
              onValueChange={(value) => setPayout(value as RefundPayout)}
              className="mt-3.5 flex flex-wrap gap-2.5"
            >
              <ChoiceCard
                value="ORIGINAL_PAYMENT"
                label={paymentLabel}
                detail="The method used for this order"
                selected={payout === 'ORIGINAL_PAYMENT'}
              />
              <ChoiceCard
                value="ALTERNATE_METHOD"
                label="That method is closed"
                detail="Amezo support will contact you for new details"
                selected={payout === 'ALTERNATE_METHOD'}
              />
            </RadioGroup>
          </section>
        )}

        <section className="mt-4 rounded-2xl border bg-background p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[13px] text-muted-foreground">
                {wantsRefund ? 'Refund requested' : 'Replacement requested, value'}
              </p>
              <p className="text-xl font-bold tabular-nums">{formatPrice(total)}</p>
            </div>
            <div className="text-right">
              <Button size="lg" disabled={!canSubmit} onClick={submit}>
                {create.isPending ? 'Sending…' : 'Send request'}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {canSubmit
                  ? `${detailedOrder.seller.name} replies within 2 business days`
                  : `Still need to ${missing.join(' and ')}`}
              </p>
            </div>
          </div>

          {create.isError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {create.error?.detail ?? "We couldn't send that request. Please try again."}
            </p>
          )}

          <p className="mt-4 text-[13px] leading-[1.55] text-muted-foreground text-pretty">
            {detailedOrder.seller.name} reviews requests within two business days. If they approve,
            you post the item back with a prepaid label and the money is released once it arrives.
          </p>
        </section>
      </main>
    </div>
  )
}
