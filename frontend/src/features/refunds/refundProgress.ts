import type { ProgressStep } from '@/features/orders/components/ProgressSteps'
import type { RefundRequestSummary } from '@/features/refunds/api/useRefundRequests'
import { formatPrice } from '@/lib/formatPrice'
import { formatShortDate } from '@/lib/formatDate'

/**
 * One place that turns a refund's status into the stepper, heading and summary
 * line the buyer's order card and the seller's queue both print, so the two
 * never disagree about what "awaiting return" looks like.
 */

const REFUND_FLOW = ['Requested', 'Approved', 'Return received', 'Refunded'] as const
const REPLACEMENT_FLOW = ['Requested', 'Approved', 'Replacement sent'] as const

/** How far along its flow each status sits. */
const REACHED: Record<RefundRequestSummary['status'], number> = {
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
  const reached = REACHED[refund.status]

  return flow.map((label, index) => {
    const position = index + 1
    return {
      key: label,
      label,
      detail: position === 1 ? formatShortDate(refund.requestedAt) : null,
      state: position < reached ? 'done' : position === reached ? 'current' : 'todo',
    }
  })
}

export function refundTitleFor(refund: RefundRequestSummary): string {
  switch (refund.status) {
    case 'REFUNDED':
      return 'Refund complete'
    case 'REPLACEMENT_SENT':
      return 'Replacement on the way'
    case 'DECLINED':
      return 'Refund declined'
    case 'CANCELLED':
      return 'Refund cancelled'
    case 'AWAITING_RETURN':
    case 'APPROVED':
      return 'Return in progress'
    case 'RETURN_RECEIVED':
      return 'Return received'
    default:
      return 'Refund requested'
  }
}

export function refundSummaryLine(refund: RefundRequestSummary): string {
  const amount = formatPrice(refund.approvedAmount ?? refund.requestedAmount)
  switch (refund.status) {
    case 'REFUNDED':
      return `${amount} was returned to your original payment method.`
    case 'REPLACEMENT_SENT':
      return 'A replacement has been sent. Nothing further is needed from you.'
    case 'DECLINED':
      return 'The seller declined this request.'
    case 'CANCELLED':
      return 'You cancelled this request.'
    case 'AWAITING_RETURN':
      return `Approved for ${amount}. Send the item back to finish the refund.`
    case 'RETURN_RECEIVED':
      return `Your return arrived. ${amount} will be paid back shortly.`
    case 'APPROVED':
      return `Approved for ${amount}.`
    default:
      return `Requested ${amount}. The seller has not responded yet.`
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
      return 'Return in progress'
    case 'RETURN_RECEIVED':
      return 'Return received'
    default:
      return 'Refund requested'
  }
}
