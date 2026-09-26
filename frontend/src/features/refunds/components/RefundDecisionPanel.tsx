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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ProgressSteps } from '@/features/orders/components/ProgressSteps'
import {
  useRefundRequest,
  useUpdateRefundRequest,
  type RefundRequestDetail,
  type RefundResolution,
  type RefundStatus,
  type UpdateRefundRequest,
} from '@/features/refunds/api/useRefundRequests'
import { refundStepsFor } from '@/features/refunds/refundProgress'
import { StatusBadge } from '@/features/seller-portal/components/StatusBadge'
import { formatMediumDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'

/** A sentence, rather than a word, before the buyer is told no. */
const DECLINE_MIN = 10

const DECLINE_REASONS = [
  'Outside the 30-day return window',
  'Item shows signs of use',
  'Fault not reproducible',
  'Not the item we shipped',
]

/** Where the buyer asked the money to go, worded as their own form worded it. */
function payoutLabel(request: RefundRequestDetail): string {
  if (request.payout === 'ALTERNATE_METHOD') return 'Another method — support will collect details'
  return request.paymentMethod ?? 'Original payment method'
}

type DecisionMode = 'approve' | 'replacement' | 'decline'

/**
 * What the seller can do next, given where the request is. The resolution is
 * the whole answer: a seller who settles a replacement request with money (or
 * the reverse) records that on the decision, so it no longer has to be guessed
 * from whether an amount happens to be set.
 */
function nextActions(request: RefundRequestDetail): readonly RefundStatus[] {
  const replacement = request.resolution === 'REPLACEMENT'
  switch (request.status) {
    case 'APPROVED':
    case 'AWAITING_RETURN':
      return replacement ? (['REPLACEMENT_SENT'] as const) : (['RETURN_RECEIVED'] as const)
    case 'RETURN_RECEIVED':
      return replacement ? (['REPLACEMENT_SENT'] as const) : (['REFUNDED'] as const)
    default:
      return [] as const
  }
}

const ACTION_LABEL: Record<string, string> = {
  RETURN_RECEIVED: 'Mark return received',
  REFUNDED: 'Release the refund',
  REPLACEMENT_SENT: 'Mark replacement sent',
}

/** The heading and line above whatever is left to do after the decision. */
function progressCopy(request: RefundRequestDetail): { title: string; note: string } {
  const held = formatPrice(request.approvedAmount ?? request.requestedAmount)
  if (request.status === 'RETURN_RECEIVED') {
    return {
      title: 'Return received',
      note: `The item is back. Releasing pays the buyer ${held}.`,
    }
  }
  if (request.resolution === 'REPLACEMENT') {
    return {
      title: 'Approved · replacement to send',
      note: 'Ship the replacement, then mark it sent. No money moves.',
    }
  }
  const label = request.returnTrackingNumber
    ? ` Return label ${request.returnTrackingNumber} issued ${formatMediumDate(request.approvedAt)}.`
    : ''
  return {
    title: 'Approved · waiting on the return',
    note: `${held} is held for ${request.buyerName ?? 'the buyer'}.${label}`,
  }
}

/** One line per step the request has actually been through. */
const EVENT_LABEL: Record<RefundStatus, string> = {
  REQUESTED: 'Requested by the buyer',
  APPROVED: 'Approved',
  AWAITING_RETURN: 'Awaiting return',
  RETURN_RECEIVED: 'Return received',
  REFUNDED: 'Money released',
  REPLACEMENT_SENT: 'Replacement sent',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled by the buyer',
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

  const [mode, setMode] = useState<DecisionMode>('approve')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [note, setNote] = useState('')

  // The drafts open on what the buyer asked for: their resolution picks the
  // mode, their amount fills the field the "Full" shortcut resets. Seeded
  // during render rather than from an effect - react(set-state-in-effect) -
  // and keyed on the id so the drawer moving to another request re-seeds.
  const [seededFrom, setSeededFrom] = useState<string | null>(null)
  if (query.data && seededFrom !== query.data.id) {
    setSeededFrom(query.data.id)
    setMode(query.data.resolution === 'REPLACEMENT' ? 'replacement' : 'approve')
    setAmount(String(query.data.requestedAmount))
    setNote('')
  }

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
  const actions = nextActions(request)
  const progress = progressCopy(request)
  const amountValue = amount === '' ? request.requestedAmount : Number(amount)
  // Number('abc') is NaN, and NaN > x is false - so a typo used to pass the
  // guard and serialise to null against a field the spec types as a number.
  const amountOk =
    Number.isFinite(amountValue) && amountValue > 0 && amountValue <= request.requestedAmount
  const amountNote = !amountOk
    ? 'Enter an amount above zero and no more than what was requested.'
    : amountValue === request.requestedAmount
      ? `Full amount requested · ${formatPrice(request.requestedAmount)}`
      : `Partial · ${formatPrice(request.requestedAmount - amountValue)} stays with you`
  const canDecline = note.trim().length >= DECLINE_MIN
  const items = request.lines.map((line) => `${line.quantity} × ${line.productTitle}`).join(', ')
  // Read off the request rather than reassembled from its timestamps - that is
  // what lets the note the seller wrote sit against the step they wrote it on.
  const history = request.events ?? []
  // Absent means the buyer's ask stands, so it is only sent when the seller
  // settles the request some other way than they were asked to.
  const chosen: RefundResolution = mode === 'replacement' ? 'REPLACEMENT' : 'REFUND'
  const resolutionPatch: Partial<UpdateRefundRequest> =
    chosen === request.resolution ? {} : { resolution: chosen }

  function act(status: RefundStatus, extra: Partial<UpdateRefundRequest> = {}) {
    update.mutate({
      status,
      ...extra,
      ...(status === 'APPROVED' ? { approvedAmount: amountValue } : {}),
      ...(status === 'DECLINED' ? { declineReason: reason } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    })
  }

  // REQUESTED -> REPLACEMENT_SENT is not a legal transition: a replacement is
  // an approval that ships an item instead of moving money, so it is written
  // as the two steps the server accepts. If the second fails the request sits
  // at APPROVED, where "Mark replacement sent" offers it again.
  async function sendReplacement() {
    try {
      await update.mutateAsync({
        status: 'APPROVED',
        ...resolutionPatch,
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      await update.mutateAsync({ status: 'REPLACEMENT_SENT' })
    } catch {
      // Surfaced by update.isError below.
    }
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
        {/* The two things the buyer chose on the form. The payout was collected
            from them and then shown to nobody. */}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-[13px] text-muted-foreground">
          <span>
            Wants{' '}
            <span className="font-semibold text-foreground">
              {request.resolution === 'REPLACEMENT' ? 'Replacement' : 'Refund'}
            </span>
          </span>
          {request.resolution === 'REFUND' && (
            <span>
              Refund to <span className="font-semibold text-foreground">{payoutLabel(request)}</span>
            </span>
          )}
        </div>
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

      {request.status === 'REQUESTED' && (
        <section className="rounded-xl border p-5">
          <SectionLabel>Your decision</SectionLabel>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Approving requests the item back. Money is released when it arrives.
          </p>

          {/* One outcome at a time. The amount and the decline reason used to
              sit side by side, so every request was half-declined on screen. */}
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as DecisionMode)}
            className="mt-3.5"
          >
            <TabsList className="flex-wrap">
              <TabsTrigger value="approve">Approve refund</TabsTrigger>
              <TabsTrigger value="replacement">Send replacement</TabsTrigger>
              <TabsTrigger value="decline">Decline</TabsTrigger>
            </TabsList>

            <TabsContent value="approve" className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="rf-amount">Refund amount</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="rf-amount"
                  inputMode="decimal"
                  className="w-[140px] tabular-nums"
                  value={amount}
                  placeholder={String(request.requestedAmount)}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => setAmount(String(request.requestedAmount))}
                >
                  Full {formatPrice(request.requestedAmount)}
                </Button>
              </div>
              <p className={amountOk ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
                {amountNote}
              </p>
              <Label htmlFor="rf-note" className="mt-2.5">
                Note to the buyer <span className="text-muted-foreground">Optional</span>
              </Label>
              <Textarea
                id="rf-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button
                className="mt-2.5 self-start"
                disabled={update.isPending || !amountOk}
                onClick={() => act('APPROVED', resolutionPatch)}
              >
                Approve and request return
              </Button>
            </TabsContent>

            <TabsContent value="replacement" className="mt-3 flex flex-col gap-1.5">
              <p className="text-sm leading-[1.55]">
                Ships {items} again at your cost. The buyer keeps the faulty one unless you ask for
                it back.
              </p>
              <Label htmlFor="rf-replacement-note" className="mt-2.5">
                Message to the buyer <span className="text-muted-foreground">Optional</span>
              </Label>
              <Textarea
                id="rf-replacement-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Recorded as an approval, then the replacement going out.
              </p>
              <Button
                className="mt-2.5 self-start"
                disabled={update.isPending}
                onClick={() => void sendReplacement()}
              >
                Send replacement
              </Button>
            </TabsContent>

            <TabsContent value="decline" className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="rf-reason">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="rf-reason" className="w-full max-w-[320px]">
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
              <Label htmlFor="rf-decline-note" className="mt-2.5">
                Explain it to the buyer
              </Label>
              <Textarea
                id="rf-decline-note"
                rows={3}
                value={note}
                placeholder="Give the buyer something they can act on."
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {canDecline
                  ? 'The buyer can escalate to Amezo support for 14 days.'
                  : 'Write at least a sentence so the buyer knows why.'}
              </p>
              <Button
                variant="destructive"
                className="mt-2.5 self-start"
                disabled={update.isPending || !canDecline}
                onClick={() => act('DECLINED')}
              >
                Decline request
              </Button>
            </TabsContent>
          </Tabs>

          {update.isError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {update.error?.detail ?? "That decision couldn't be saved."}
            </p>
          )}
        </section>
      )}

      {/* The design also offers "Undo approval" here. Nothing legal walks an
          approved request back to REQUESTED - APPROVED only moves forward, and
          CANCELLED is the buyer's, from REQUESTED - so it is left out rather
          than shipped as a button that 409s. */}
      {request.status !== 'REQUESTED' && actions.length > 0 && (
        <section className="rounded-xl border p-5">
          <h3 className="text-sm font-bold">{progress.title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{progress.note}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button key={action} disabled={update.isPending} onClick={() => act(action)}>
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

      {history.length > 0 && (
        <section>
          <SectionLabel>History</SectionLabel>
          <ol className="mt-2 flex flex-col gap-2">
            {history.map((entry, index) => (
              // Two steps can share a status only across a retry, so the
              // status and its position together are the identity.
              <li
                key={`${entry.status}-${index}`}
                className="flex flex-wrap items-baseline gap-x-2 text-[13px]"
              >
                <span className="font-medium">{EVENT_LABEL[entry.status]}</span>
                <span className="text-muted-foreground">{formatMediumDate(entry.at)}</span>
                {entry.note && <span className="text-muted-foreground">· {entry.note}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
