import type { components } from '@/lib/api/schema'

type RefundRequestDetail = components['schemas']['RefundRequestDetail']
type RefundRequestSummary = components['schemas']['RefundRequestSummary']
type RefundStatus = components['schemas']['RefundStatus']

/**
 * The refund store for local development and tests.
 *
 * /api/v1/refund-requests does not exist on the backend yet, so this is the
 * integration boundary for it. The transition rules below mirror the ones in
 * docs/backend-handoff.md so a screen cannot be written against a state machine
 * the backend will refuse.
 */

const SELLER = {
  id: '99999999-9999-9999-9999-999999999999',
  name: 'Aurora Audio',
  handle: 'aurora-audio',
}

function make(
  id: string,
  reference: string,
  buyerName: string,
  buyerEmail: string,
  orderReference: string,
  status: RefundStatus,
  resolution: 'REFUND' | 'REPLACEMENT',
  detail: string,
  lines: RefundRequestDetail['lines'],
  extra: Partial<RefundRequestDetail> = {},
): RefundRequestDetail {
  const requestedAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  return {
    id,
    reference,
    status,
    resolution,
    payout: 'ORIGINAL_PAYMENT',
    detail,
    requestedAt: '2026-09-24T09:00:00Z',
    requestedAmount,
    approvedAmount: null,
    currency: 'USD',
    orderId: `order-${id}`,
    orderReference,
    orderPlacedAt: '2026-09-23T09:00:00Z',
    buyerName,
    buyerEmail,
    seller: SELLER,
    paymentMethod: null,
    lines,
    ...extra,
  }
}

const SEED: RefundRequestDetail[] = [
  make(
    'ref-1', 'ref_4d90b12c', 'Jonas Lindqvist', 'j.lindqvist@example.com', 'ord_7b02e315',
    'REQUESTED', 'REFUND',
    'The left earcup stopped producing sound about a week after delivery. Everything else works and the box and cable are intact.',
    [{ orderLineId: 'l1', productTitle: 'Wireless Noise-Cancelling Headphones', variantLabel: 'Sand', quantity: 2, unitPrice: 129.99, lineTotal: 259.98 }],
  ),
  make(
    'ref-2', 'ref_77a1e604', 'Kenji Tanaka', 'k.tanaka@example.com', 'ord_5ad83b11',
    'REQUESTED', 'REPLACEMENT',
    'Two of the three cases arrived with the charging contacts bent. Happy to keep the working one.',
    [{ orderLineId: 'l2', productTitle: 'Mechanical Keyboard, Hot-Swappable', variantLabel: 'White', quantity: 2, unitPrice: 149, lineTotal: 298 }],
  ),
  make(
    'ref-3', 'ref_90ce34aa', 'Rhea Patel', 'r.patel@example.com', 'ord_19ff4c82',
    'AWAITING_RETURN', 'REFUND',
    'Headband cracked on the second day of use.',
    [{ orderLineId: 'l3', productTitle: 'Wireless Noise-Cancelling Headphones', variantLabel: 'Midnight', quantity: 1, unitPrice: 129.99, lineTotal: 129.99 }],
    { approvedAmount: 129.99, approvedAt: '2026-09-21T09:00:00Z', returnTrackingNumber: 'AZ-RET-88412' },
  ),
  make(
    'ref-4', 'ref_15b7d420', 'Diego Alvarez', 'd.alvarez@example.com', 'ord_2c9a6f40',
    'DECLINED', 'REFUND',
    'Changed my mind after setting them up.',
    [{ orderLineId: 'l4', productTitle: '14" Ultrabook Laptop, 16GB RAM', variantLabel: 'Silver', quantity: 1, unitPrice: 899, lineTotal: 899 }],
    { declinedAt: '2026-09-04T09:00:00Z', declineReason: 'Item shows signs of use' },
  ),
  // Raised against the first demo seller order (see fixtures/sellerOrders.ts),
  // so the seller-side "this order has a refund" branches are reachable by
  // opening the app. They were dead code while the order fixture answered
  // hasOpenRefund: false for every order. Appended last on purpose: the queue
  // is served in store order, so the rows the existing tests reach for by
  // position do not move.
  make(
    'ref-5', 'ref_2f81aa07', 'Alex', 'alex@example.com', 'ord_00000001',
    'REQUESTED', 'REFUND',
    'One earcup rattles at anything above half volume. Box, cable and pads are all still here.',
    [{ orderLineId: 'd0000000-0000-0000-0000-000000000001-line-1', productTitle: 'Wireless Noise-Cancelling Headphones', variantLabel: 'Black', quantity: 1, unitPrice: 129.99, lineTotal: 129.99 }],
    { orderId: 'd0000000-0000-0000-0000-000000000001', orderPlacedAt: '2026-09-23T14:12:00.000Z' },
  ),
]

let store: RefundRequestDetail[] = structuredClone(SEED)

export function resetRefundRequests(seed: RefundRequestDetail[] = structuredClone(SEED)) {
  store = seed
}

export function listRefundRequests(): RefundRequestDetail[] {
  return store
}

export function findRefundRequest(id: string): RefundRequestDetail | undefined {
  return store.find((request) => request.id === id)
}

/**
 * Every request raised against one order, matched on order id the way the
 * backend's foreign key will. The order fixtures derive their refund fields
 * from this instead of returning constants - an order that always said "no
 * open refund" left the screens that branch on one permanently untested.
 */
export function refundRequestsForOrder(orderId: string): RefundRequestDetail[] {
  return store.filter((request) => request.orderId === orderId)
}

/**
 * What POST /api/v1/refund-requests adds. One store answers every read, so a
 * request the buyer just raised is visible to the seller's queue and to the
 * order it was raised against, rather than only to the order.
 */
export function addRefundRequest(request: RefundRequestDetail): RefundRequestDetail {
  store.push(request)
  return request
}

export function summaryOfRefund(request: RefundRequestDetail): RefundRequestSummary {
  return {
    id: request.id,
    reference: request.reference,
    status: request.status,
    resolution: request.resolution,
    requestedAt: request.requestedAt,
    requestedAmount: request.requestedAmount,
    approvedAmount: request.approvedAmount,
    currency: request.currency,
    orderId: request.orderId,
    orderReference: request.orderReference,
    returnTrackingNumber: request.returnTrackingNumber,
  }
}

/** Exactly the transitions the handoff document specifies. */
const LEGAL: Record<RefundStatus, RefundStatus[]> = {
  REQUESTED: ['APPROVED', 'DECLINED', 'CANCELLED'],
  APPROVED: ['AWAITING_RETURN', 'RETURN_RECEIVED', 'REPLACEMENT_SENT'],
  AWAITING_RETURN: ['RETURN_RECEIVED'],
  RETURN_RECEIVED: ['REFUNDED', 'REPLACEMENT_SENT'],
  REFUNDED: [],
  REPLACEMENT_SENT: [],
  DECLINED: [],
  CANCELLED: [],
}

export function canTransition(from: RefundStatus, to: RefundStatus): boolean {
  return LEGAL[from].includes(to)
}

/**
 * Still live, as opposed to settled one way or another. Read straight off the
 * transition map so the two cannot disagree: a request is open exactly while
 * the backend would still accept a move out of its current status. The app has
 * its own isRefundOpen() for the same question, but this directory imports
 * nothing from the app but generated types - a mock that borrowed a UI helper
 * would quietly change shape whenever the UI did.
 */
export function isRefundOpen(status: RefundStatus): boolean {
  return LEGAL[status].length > 0
}

export function updateRefundRequest(
  id: string,
  patch: Partial<RefundRequestDetail>,
): RefundRequestDetail | undefined {
  const index = store.findIndex((request) => request.id === id)
  if (index === -1) return undefined
  store[index] = { ...store[index], ...patch }
  return store[index]
}
