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
import { ProgressSteps } from '@/features/orders/components/ProgressSteps'
import {
  useRefundRequest,
  useUpdateRefundRequest,
  type RefundStatus,
} from '@/features/refunds/api/useRefundRequests'
import { refundStepsFor } from '@/features/refunds/refundProgress'
import { StatusBadge } from '@/features/seller-portal/components/StatusBadge'
import { formatMediumDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'

const DECLINE_REASONS = [
  'Outside the 30-day return window',
  'Item shows signs of use',
  'Returned item does not match the order',
  'Other',
]

/** What the seller can do next, given where the request is. */
function nextActions(
  status: RefundStatus,
  resolution: 'REFUND' | 'REPLACEMENT',
): readonly RefundStatus[] {
  switch (status) {
    case 'REQUESTED':
      return ['AWAITING_RETURN', 'DECLINED'] as const
    case 'APPROVED':
    case 'AWAITING_RETURN':
      return ['RETURN_RECEIVED'] as const
    case 'RETURN_RECEIVED':
      return resolution === 'REPLACEMENT' ? (['REPLACEMENT_SENT'] as const) : (['REFUNDED'] as const)
    default:
      return [] as const
  }
}

const ACTION_LABEL: Record<string, string> = {
  AWAITING_RETURN: 'Approve and request return',
  DECLINED: 'Decline',
  RETURN_RECEIVED: 'Mark return received',
  REFUNDED: 'Release the refund',
  REPLACEMENT_SENT: 'Mark replacement sent',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

/**
 * One refund request, with whatever decision is legal from its current state.
 * Rendered in the refunds list's drawer and at its own route, same as the
 * product and order panels.
 */
export function RefundDecisionPanel({ refundRequestId }: { refundRequestId: string }) {
  const query = useRefundRequest(refundRequestId)
  const update = useUpdateRefundRequest(refundRequestId)

  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [note, setNote] = useState('')

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
        <p className="font-medium">Couldn't load this request</p>
        <p className="text-sm text-muted-foreground">
          {query.error?.detail ?? 'Something went wrong. Try again.'}
        </p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const request = query.data
  const actions = nextActions(request.status, request.resolution)
  const amountValue = amount === '' ? request.requestedAmount : Number(amount)
  const amountTooHigh = amountValue > request.requestedAmount

  function act(status: RefundStatus) {
    update.mutate({
      status,
      ...(status === 'AWAITING_RETURN' ? { approvedAmount: amountValue } : {}),
      ...(status === 'DECLINED' ? { declineReason: reason } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={request.status} />
        <span className="font-mono text-xs text-muted-foreground">{request.reference}</span>
        <span className="ml-auto text-sm font-semibold tabular-nums">
          {formatPrice(request.approvedAmount ?? request.requestedAmount)}
        </span>
      </div>

      <ProgressSteps steps={refundStepsFor(request)} />

      <section>
        <SectionLabel>Buyer</SectionLabel>
        <p className="mt-2 text-sm font-medium">{request.buyerName ?? 'Buyer'}</p>
        <p className="text-[13px] text-muted-foreground">{request.buyerEmail}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Order {request.orderReference} · placed {formatMediumDate(request.orderPlacedAt)} ·
          requested {formatMediumDate(request.requestedAt)}
        </p>
      </section>

      <section>
        <SectionLabel>What they said</SectionLabel>
        <p className="mt-2 text-sm leading-[1.6] text-pretty">{request.detail}</p>
      </section>

      <section>
        <SectionLabel>
          {request.resolution === 'REPLACEMENT' ? 'Replacement for' : 'Refund for'}
        </SectionLabel>
        <div className="mt-2 overflow-hidden rounded-lg border">
          {request.lines.map((line) => (
            <div
              key={line.orderLineId}
              className="flex flex-wrap items-center gap-3 border-b p-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{line.productTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {line.variantLabel} · qty {line.quantity}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {formatPrice(line.lineTotal)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {request.declineReason && (
        <section>
          <SectionLabel>Declined because</SectionLabel>
          <p className="mt-2 text-sm">{request.declineReason}</p>
        </section>
      )}

      {actions.length > 0 && (
        <section className="rounded-xl border p-5">
          <SectionLabel>Your decision</SectionLabel>

          {actions.includes('AWAITING_RETURN') && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rf-amount">Refund amount</Label>
                <Input
                  id="rf-amount"
                  inputMode="decimal"
                  value={amount}
                  placeholder={String(request.requestedAmount)}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Requested {formatPrice(request.requestedAmount)}
                </p>
                {amountTooHigh && (
                  <p className="text-xs text-destructive">
                    Cannot be more than the requested amount.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rf-reason">Reason, if declining</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger id="rf-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DECLINE_REASONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="rf-note">
              Note to the buyer <span className="text-muted-foreground">Optional</span>
            </Label>
            <Textarea
              id="rf-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action}
                variant={action === 'DECLINED' ? 'outline' : 'default'}
                disabled={update.isPending || (action === 'AWAITING_RETURN' && amountTooHigh)}
                onClick={() => act(action)}
              >
                {ACTION_LABEL[action]}
              </Button>
            ))}
          </div>

          {update.isError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {update.error?.detail ?? "That decision couldn't be saved."}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
