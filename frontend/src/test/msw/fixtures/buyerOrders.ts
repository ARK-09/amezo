import type { components } from '@/lib/api/schema'

import { isRefundOpen, refundRequestsForOrder, summaryOfRefund } from './refunds'

type BuyerOrderDetail = components['schemas']['BuyerOrderDetail']
type BuyerOrderLine = components['schemas']['BuyerOrderLine']
type BuyerOrderSummary = components['schemas']['BuyerOrderSummary']

/**
 * Buyer order history for local development and tests.
 *
 * This is the explicit integration boundary for /api/v1/orders and
 * /api/v1/refund-requests: neither exists on the backend yet. It is wired
 * through MSW, which only runs under VITE_USE_MSW and in vitest - production
 * calls the real endpoint and shows the ordinary error until the backend
 * ships. Nothing here is compiled into the app.
 */

/**
 * What the store actually holds. None of the refund fields are in here: they
 * are read off the refund store on every request instead. The order used to
 * carry its own copy of them, which PATCH /api/v1/refund-requests never wrote
 * back to, so a buyer's card went on badging "Refund requested" long after the
 * seller had refunded or declined it.
 */
type StoredBuyerOrder = Omit<BuyerOrderDetail, 'lines' | 'refundRequests' | 'canRequestRefund'> & {
  lines: Omit<BuyerOrderLine, 'refundRequestId' | 'refundStatus'>[]
}

const ADDRESS = {
  fullName: 'Rhea Patel',
  line1: '118 Ferndale Road',
  line2: 'Apt 4',
  city: 'Portland',
  state: 'OR',
  postalCode: '97214',
  country: 'US',
}

const SELLER = {
  id: '99999999-9999-9999-9999-999999999999',
  name: 'Aurora Audio',
  handle: 'aurora-audio',
}

function timeline(reached: number, dates: (string | null)[]) {
  const stages = [
    { code: 'PLACED' as const, label: 'Order placed' },
    { code: 'PACKED' as const, label: 'Packed' },
    { code: 'SHIPPED' as const, label: 'Shipped' },
    { code: 'DELIVERED' as const, label: 'Delivered' },
  ]
  return stages.map((stage, index) => ({
    ...stage,
    at: dates[index],
    estimated: index >= reached,
    completed: index < reached,
    detail: null,
  }))
}

// order-1111's refund lives in fixtures/refunds.ts as ref-3, raised against
// this order id and this line id. It is not repeated here.
const SEED_ORDERS: Record<string, StoredBuyerOrder> = {
  'order-1111': {
    id: 'order-1111',
    reference: 'ord_19ff4c82',
    placedAt: '2026-09-17T09:00:00Z',
    status: 'IN_TRANSIT',
    seller: SELLER,
    lines: [
      {
        id: 'line-1111-a',
        productRef: 'wireless-noise-cancelling-headphones',
        productTitle: 'Wireless Noise-Cancelling Headphones',
        variantLabel: 'Midnight',
        thumbnailUrl: null,
        quantity: 1,
        unitPrice: 129.99,
        lineTotal: 129.99,
      },
    ],
    subtotal: 129.99,
    shipping: 0,
    tax: 13.41,
    total: 143.4,
    currency: 'USD',
    timeline: timeline(3, [
      '2026-09-17T09:00:00Z',
      '2026-09-18T09:00:00Z',
      '2026-09-19T09:00:00Z',
      '2026-09-28T09:00:00Z',
    ]),
    shipment: {
      carrier: 'Amezo Express',
      trackingNumber: '1Z-4471-9920',
      trackingUrl: null,
      estimatedDeliveryAt: '2026-09-28T09:00:00Z',
      deliveredAt: null,
      deliveryNote: null,
    },
    shippingAddress: ADDRESS,
    billingAddress: null,
    payment: null,
    refundWindowEndsAt: null,
  },
  'order-2222': {
    id: 'order-2222',
    reference: 'ord_c41d9a70',
    placedAt: '2026-09-12T09:00:00Z',
    status: 'DELIVERED',
    seller: { id: SELLER.id, name: 'Vexel', handle: 'vexel' },
    lines: [
      {
        id: 'line-2222-a',
        productRef: '14-ultrabook-laptop-16gb-ram',
        productTitle: '14" Ultrabook Laptop, 16GB RAM',
        variantLabel: 'Silver',
        thumbnailUrl: null,
        quantity: 1,
        unitPrice: 899,
        lineTotal: 899,
      },
    ],
    subtotal: 899,
    shipping: 0,
    tax: 8.91,
    total: 907.91,
    currency: 'USD',
    timeline: timeline(4, [
      '2026-09-12T09:00:00Z',
      '2026-09-13T09:00:00Z',
      '2026-09-14T09:00:00Z',
      '2026-09-16T09:00:00Z',
    ]),
    shipment: {
      carrier: null,
      trackingNumber: null,
      trackingUrl: null,
      estimatedDeliveryAt: null,
      deliveredAt: '2026-09-16T09:00:00Z',
      deliveryNote: 'Left with a neighbour at #116',
    },
    shippingAddress: ADDRESS,
    billingAddress: null,
    payment: null,
    refundWindowEndsAt: '2026-10-16T09:00:00Z',
  },
}

let orders: Record<string, StoredBuyerOrder> = structuredClone(SEED_ORDERS)

/** Module state like the rest of the fixtures, so each test starts from the seed. */
export function resetBuyerOrders() {
  orders = structuredClone(SEED_ORDERS)
}

export function findBuyerOrder(id: string): StoredBuyerOrder | undefined {
  return orders[id]
}

/**
 * The refund requests raised against this order, read from the refund store on
 * every call the way fixtures/sellerOrders.ts does. One record answers both
 * sides now: the seller settling a request moves the buyer's order with it.
 */
function refundsOn(order: StoredBuyerOrder) {
  return refundRequestsForOrder(order.id)
}

/**
 * REFUNDED is derived from the refund request, never stored on the order - the
 * same rule the seller side applies, so buyer and seller never disagree about
 * whether an order was refunded. A replacement is not a refund, so
 * REPLACEMENT_SENT leaves the fulfilment status alone.
 */
function statusOf(order: StoredBuyerOrder): StoredBuyerOrder['status'] {
  const refunded = refundsOn(order).some((refund) => refund.status === 'REFUNDED')
  return refunded ? 'REFUNDED' : order.status
}

export function buyerOrderDetailOf(order: StoredBuyerOrder): BuyerOrderDetail {
  const raised = refundsOn(order)
  return {
    ...order,
    status: statusOf(order),
    lines: order.lines.map((line) => {
      // The contract sets these "when this line is inside an open refund
      // request", so settling one clears the line's "In refund" flag rather
      // than leaving it lit for good. Latest first: one open request per line.
      const open = raised.findLast(
        (refund) =>
          isRefundOpen(refund.status) &&
          refund.lines.some((refundLine) => refundLine.orderLineId === line.id),
      )
      return {
        ...line,
        refundRequestId: open?.id ?? null,
        refundStatus: open?.status ?? null,
      }
    }),
    refundRequests: raised.map(summaryOfRefund),
    // Server-owned eligibility, derived rather than a flag flipped once when a
    // request was posted: the backend allows one *open* request per line, so a
    // declined one lets the buyer ask again. refundWindowEndsAt stays a date
    // the screen prints - comparing it to the wall clock would make the seed
    // silently expire.
    canRequestRefund:
      order.status === 'DELIVERED' && !raised.some((refund) => isRefundOpen(refund.status)),
  }
}

function summaryOf(order: StoredBuyerOrder): BuyerOrderSummary {
  const detail = buyerOrderDetailOf(order)
  // The card badges the request currently attached to the order, whatever its
  // status - "a refund that has been approved or declined does not read the
  // same as one nobody has looked at yet". Its status is whatever the store
  // says now, not what it said when the order was seeded.
  const current = detail.refundRequests?.at(-1)
  return {
    id: detail.id,
    reference: detail.reference,
    placedAt: detail.placedAt,
    status: detail.status,
    total: detail.total,
    currency: detail.currency,
    itemCount: detail.lines.reduce((sum, line) => sum + line.quantity, 0),
    seller: detail.seller,
    previewLines: detail.lines.slice(0, 2),
    shipment: detail.shipment,
    openRefundRequestId: current?.id ?? null,
    openRefundStatus: current?.status ?? null,
  }
}

export function listBuyerOrders(): BuyerOrderSummary[] {
  return Object.values(orders).map(summaryOf)
}

/**
 * The buyer's order tabs. Shared by the list and its facets so a tab's count
 * and the rows behind it are computed by the same predicate - two copies would
 * drift the first time a group's definition changed.
 */
export function inBuyerGroup(order: BuyerOrderSummary, group: string): boolean {
  if (group === 'delivered') return order.status === 'DELIVERED'
  if (group === 'in_progress') return !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status)
  if (group === 'refunds') return Boolean(order.openRefundRequestId)
  return true
}
