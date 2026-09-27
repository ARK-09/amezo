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
  // The four below exist so the states the design draws are reachable by opening
  // the app rather than only by a test stubbing the endpoint: a cancelled order, an
  // order of more than one line (which is what "+1 more" and "Review these items"
  // need), one outside the twelve-month window the select opens on, and a second
  // in-progress order - six in all, so a ?size=5 has a second page.
  'order-3333': {
    id: 'order-3333',
    reference: 'ord_af6218d3',
    placedAt: '2026-08-11T09:00:00Z',
    status: 'CANCELLED',
    seller: SELLER,
    lines: [
      {
        id: 'line-3333-a',
        productRef: 'trail-running-shoes',
        productTitle: 'Trail Running Shoes',
        variantLabel: 'UK 9',
        thumbnailUrl: null,
        quantity: 1,
        unitPrice: 119,
        lineTotal: 119,
      },
    ],
    subtotal: 119,
    shipping: 0,
    tax: 11.9,
    total: 130.9,
    currency: 'USD',
    // A cancelled order never left the seller, and OrderTimelineEntry has no code
    // for cancellation, so its timeline is the one stage that did happen.
    timeline: [
      {
        code: 'PLACED',
        label: 'Order placed',
        at: '2026-08-11T09:00:00Z',
        estimated: false,
        completed: true,
        detail: null,
      },
    ],
    shipment: {
      carrier: null,
      trackingNumber: null,
      trackingUrl: null,
      estimatedDeliveryAt: null,
      deliveredAt: null,
      deliveryNote: 'Cancelled before dispatch',
    },
    shippingAddress: ADDRESS,
    billingAddress: null,
    payment: null,
    refundWindowEndsAt: null,
  },
  'order-4444': {
    id: 'order-4444',
    reference: 'ord_e0417cc6',
    placedAt: '2026-05-02T09:00:00Z',
    status: 'DELIVERED',
    seller: SELLER,
    lines: [
      {
        id: 'line-4444-a',
        productRef: 'ceramic-non-stick-cookware-set-10-piece',
        productTitle: 'Ceramic Non-Stick Cookware Set (10-piece)',
        variantLabel: 'Slate',
        thumbnailUrl: null,
        quantity: 1,
        unitPrice: 189,
        lineTotal: 189,
      },
      {
        id: 'line-4444-b',
        productRef: 'stainless-steel-water-bottle-32oz',
        productTitle: 'Stainless Steel Water Bottle, 32oz',
        variantLabel: 'Brushed',
        thumbnailUrl: null,
        quantity: 2,
        unitPrice: 32,
        lineTotal: 64,
      },
    ],
    subtotal: 253,
    shipping: 6,
    tax: 25.3,
    total: 284.3,
    currency: 'USD',
    timeline: timeline(4, [
      '2026-05-02T09:00:00Z',
      '2026-05-03T09:00:00Z',
      '2026-05-03T09:00:00Z',
      '2026-05-06T09:00:00Z',
    ]),
    shipment: {
      carrier: null,
      trackingNumber: null,
      trackingUrl: null,
      estimatedDeliveryAt: null,
      deliveredAt: '2026-05-06T09:00:00Z',
      deliveryNote: 'Handed to resident',
    },
    shippingAddress: ADDRESS,
    billingAddress: null,
    payment: null,
    refundWindowEndsAt: '2026-06-05T09:00:00Z',
  },
  'order-5555': {
    id: 'order-5555',
    reference: 'ord_66de1a09',
    placedAt: '2025-06-14T09:00:00Z',
    status: 'DELIVERED',
    seller: SELLER,
    lines: [
      {
        // The same product order-2222 carries, but a year earlier: the two never
        // appear in the same date window, so neither title is ever ambiguous.
        id: 'line-5555-a',
        productRef: '14-ultrabook-laptop-16gb-ram',
        productTitle: '14" Ultrabook Laptop, 16GB RAM',
        variantLabel: 'Graphite',
        thumbnailUrl: null,
        quantity: 1,
        unitPrice: 799,
        lineTotal: 799,
      },
    ],
    subtotal: 799,
    shipping: 6,
    tax: 79.9,
    total: 884.9,
    currency: 'USD',
    timeline: timeline(4, [
      '2025-06-14T09:00:00Z',
      '2025-06-15T09:00:00Z',
      '2025-06-16T09:00:00Z',
      '2025-06-19T09:00:00Z',
    ]),
    shipment: {
      carrier: null,
      trackingNumber: null,
      trackingUrl: null,
      estimatedDeliveryAt: null,
      deliveredAt: '2025-06-19T09:00:00Z',
      deliveryNote: 'Left in the parcel locker',
    },
    shippingAddress: ADDRESS,
    billingAddress: null,
    payment: null,
    refundWindowEndsAt: '2025-07-19T09:00:00Z',
  },
  'order-6666': {
    id: 'order-6666',
    reference: 'ord_2c9a6f40',
    placedAt: '2026-09-20T09:00:00Z',
    status: 'SHIPPED',
    seller: SELLER,
    lines: [
      {
        // Deliberately not one of the products the orders above carry: a title
        // that appears on two cards at once makes every test that reaches for a
        // card by what is in it ambiguous.
        id: 'line-6666-a',
        productRef: 'mechanical-keyboard-hot-swappable',
        productTitle: 'Mechanical Keyboard, Hot-Swappable',
        variantLabel: 'Black',
        thumbnailUrl: null,
        quantity: 1,
        unitPrice: 149,
        lineTotal: 149,
      },
    ],
    subtotal: 149,
    shipping: 0,
    tax: 14.9,
    total: 163.9,
    currency: 'USD',
    timeline: timeline(3, [
      '2026-09-20T09:00:00Z',
      '2026-09-21T09:00:00Z',
      '2026-09-22T09:00:00Z',
      '2026-09-29T09:00:00Z',
    ]),
    shipment: {
      carrier: 'Amezo Express',
      trackingNumber: '1Z-5518-2043',
      // Null like every other shipment here: nothing in the fixtures knows a
      // real carrier URL, and inventing one would be a link to nowhere.
      trackingUrl: null,
      estimatedDeliveryAt: '2026-09-29T09:00:00Z',
      deliveredAt: null,
      deliveryNote: null,
    },
    shippingAddress: ADDRESS,
    billingAddress: null,
    payment: null,
    refundWindowEndsAt: null,
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

/** "newest first", as the contract says - not the order the seed happens to be in. */
export function listBuyerOrders(): BuyerOrderSummary[] {
  return Object.values(orders)
    .map(summaryOf)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
}

/** Whether this order is the signed-in buyer's, which is every order in here. */
export function isBuyerOrderId(orderId: string): boolean {
  return orderId in orders
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

/**
 * What ?q= searches, shared by the list and its facets. They used to disagree -
 * the list matched product titles and the facets matched the seller's name - so a
 * term could show two orders under a tab that counted none of them. "Order number
 * or product name", as the box says, so the seller's name is in neither now.
 */
export function matchesBuyerQuery(order: BuyerOrderSummary, q: string | null | undefined): boolean {
  if (!q) return true
  const haystack = [
    order.reference,
    ...(order.previewLines ?? []).flatMap((line) => [line.productTitle, line.variantLabel]),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q.toLowerCase())
}

/** `from`/`to` are plain dates in the contract, and placedAt is a timestamp. */
export function inBuyerDateRange(
  order: BuyerOrderSummary,
  from: string | null,
  to: string | null,
): boolean {
  const day = order.placedAt.slice(0, 10)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

