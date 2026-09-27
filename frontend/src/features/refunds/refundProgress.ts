import type { ProgressStep } from '@/features/orders/components/ProgressSteps'
import type { RefundRequestSummary } from '@/features/refunds/api/useRefundRequests'
import { formatPrice } from '@/lib/formatPrice'
import { formatMediumDate, formatShortDate } from '@/lib/formatDate'

/**
 * One place that turns a refund's status into the stepper, heading and summary
 * line the buyer's order card and the seller's queue both print, so the two
 * never disagree about what "awaiting return" looks like.
 */

const REFUND_FLOW = ['Requested', 'Approved', 'Return received', 'Refunded'] as const
const REPLACEMENT_FLOW = ['Requested', 'Approved', 'Replacement sent'] as const

/**
 * How many steps of the flow this status has actually completed. A terminal
 * status completes its whole flow - REFUNDED is the fourth step of four, not
 * the fourth step in progress - so the last dot fills rather than sitting
 * half-drawn under a heading that says the refund is complete.
 */
const COMPLETED: Record<RefundRequestSummary['status'], number> = {
  REQUESTED: 1,
  APPROVED: 2,
  AWAITING_RETURN: 2,
  RETURN_RECEIVED: 3,
  REFUNDED: 4,
  REPLACEMENT_SENT: 3,
  DECLINED: 1,
  CANCELLED: 1,
}

export function refundStepsFor(refund: RefundRequestSummary): ProgressStep[] {
  if (refund.status === 'DECLINED' || refund.status === 'CANCELLED') {
    return [
      { key: 'requested', label: 'Requested', detail: formatShortDate(refund.requestedAt), state: 'done' },
      {
        key: 'closed',
        label: refund.status === 'DECLINED' ? 'Declined' : 'Cancelled',
        detail: null,
        state: 'failed',
      },
    ]
  }

  const flow = refund.resolution === 'REPLACEMENT' ? REPLACEMENT_FLOW : REFUND_FLOW
  const completed = COMPLETED[refund.status]

  return flow.map((label, index) => {
    const position = index + 1
    return {
      key: label,
      label,
      detail: position === 1 ? formatShortDate(refund.requestedAt) : null,
      state: position <= completed ? 'done' : position === completed + 1 ? 'current' : 'todo',
    }
  })
}

/**
 * Everything the buyer-facing copy below reads. A `RefundRequestSummary` satisfies
 * it, and a `RefundRequestDetail` satisfies it with more: the design's sentences
 * name the product, the decline reason and the day the money moved, none of which
 * the summary a list serves carries. Each of those is optional here so the copy
 * degrades to a shorter true sentence rather than waiting on a second request.
 */
export interface RefundCopySource {
  status: RefundRequestSummary['status']
  requestedAmount: number
  approvedAmount?: number | null
  returnTrackingNumber?: string | null
  refundedAt?: string | null
  declineReason?: string | null
  lines?: { productTitle: string }[]
}

/** The amount actually at stake: what the seller settled on, or what was asked. */
function amountOf(refund: RefundCopySource): string {
  return formatPrice(refund.approvedAmount ?? refund.requestedAmount)
}

/**
 * What the request is about, as the buyer copy names it. One line reads as the
 * product; several read as a count, because the sentences are built around a
 * single subject and "Drop A, B and C at any carrier point" is not the design.
 */
function subjectOf(refund: RefundCopySource): string {
  const lines = refund.lines ?? []
  if (lines.length === 1) return lines[0].productTitle
  if (lines.length > 1) return `${lines.length} items`
  return 'this item'
}

export function refundTitleFor(refund: RefundCopySource): string {
  switch (refund.status) {
    case 'REFUNDED':
      return 'Refunded'
    case 'REPLACEMENT_SENT':
      return 'Replacement on the way'
    case 'DECLINED':
      return 'Refund declined'
    case 'CANCELLED':
      return 'Refund cancelled'
    case 'AWAITING_RETURN':
    case 'APPROVED':
      return 'Refund approved — send the item back'
    case 'RETURN_RECEIVED':
      return 'Return received'
    default:
      return 'Refund requested'
  }
}

export function refundSummaryLine(refund: RefundCopySource): string {
  const amount = amountOf(refund)
  const subject = subjectOf(refund)
  switch (refund.status) {
    case 'REFUNDED':
      return refund.refundedAt
        ? `${amount} went back to your card on ${formatMediumDate(refund.refundedAt)}. Statements usually show it within five working days.`
        : `${amount} went back to your card. Statements usually show it within five working days.`
    case 'REPLACEMENT_SENT':
      return `The seller is sending a new ${subject} instead of a refund. No return needed for the original.`
    case 'DECLINED':
      return refund.declineReason
        ? `The seller declined this request: ${refund.declineReason}.`
        : 'The seller declined this request.'
    case 'CANCELLED':
      return 'You cancelled this request, so nothing is being returned or refunded.'
    case 'AWAITING_RETURN':
    case 'APPROVED':
      return refund.returnTrackingNumber
        ? `Drop ${subject} at any carrier point using label ${refund.returnTrackingNumber}. ${amount} is released once it is scanned in.`
        : `Send ${subject} back to the seller. ${amount} is released once it is scanned in.`
    case 'RETURN_RECEIVED':
      return `Your return arrived. ${amount} will be paid back shortly.`
    default:
      return `You asked for ${amount} back on ${subject}. The seller has not answered yet.`
  }
}

/** The pill the order card shows when a refund is attached. */
export function refundBadgeLabel(status: RefundRequestSummary['status']): string {
  switch (status) {
    case 'REFUNDED':
      return 'Refunded'
    case 'REPLACEMENT_SENT':
      return 'Replacement sent'
    case 'DECLINED':
      return 'Refund declined'
    case 'CANCELLED':
      return 'Refund cancelled'
    case 'AWAITING_RETURN':
      return 'Return this item'
    case 'APPROVED':
      return 'Refund approved'
    case 'RETURN_RECEIVED':
      return 'Return received'
    default:
      return 'Refund under review'
  }
}

/**
 * The tag on an order line a refund covers: "REFUNDED" once the money has moved,
 * "IN REFUND" while it is still in hand. A declined or cancelled request leaves
 * no tag - nothing about that line is being returned or paid back, which is also
 * why the design flags the lines of every other status and not those.
 */
export function refundLineTag(status: RefundRequestSummary['status']): string | null {
  if (status === 'DECLINED' || status === 'CANCELLED') return null
  return status === 'REFUNDED' ? 'REFUNDED' : 'IN REFUND'
}

/** Whether a refund is still live, as opposed to settled one way or another. */
export function isRefundOpen(status: RefundRequestSummary['status']): boolean {
  return !['REFUNDED', 'REPLACEMENT_SENT', 'DECLINED', 'CANCELLED'].includes(status)
}
