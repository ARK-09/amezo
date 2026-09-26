import type { components } from '@/lib/api/schema'

type BuyerOrderDetail = components['schemas']['BuyerOrderDetail']
type BuyerOrderSummary = components['schemas']['BuyerOrderSummary']
type RefundRequestDetail = components['schemas']['RefundRequestDetail']
type RefundRequestSummary = components['schemas']['RefundRequestSummary']

/**
 * Buyer order history for local development and tests.
 *
 * This is the explicit integration boundary for /api/v1/orders and
 * /api/v1/refund-requests: neither exists on the backend yet. It is wired
 * through MSW, which only runs under VITE_USE_MSW and in vitest - production
 * calls the real endpoint and shows the ordinary error until the backend
 * ships. Nothing here is compiled into the app.
 */

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

export const refundRequests: RefundRequestDetail[] = [
  {
    id: 'ref-1111',
    reference: 'ref_90ce34aa',
    status: 'AWAITING_RETURN',
    resolution: 'REFUND',
    payout: 'ORIGINAL_PAYMENT',
    detail: 'Headband cracked on the second day of use.',
    requestedAt: '2026-09-20T10:00:00Z',
    requestedAmount: 129.99,
    approvedAmount: 129.99,
    currency: 'USD',
    orderId: 'order-1111',
    orderReference: 'ord_19ff4c82',
    orderPlacedAt: '2026-09-17T09:00:00Z',
    buyerName: 'Rhea Patel',
    buyerEmail: 'r.patel@example.com',
    seller: SELLER,
    lines: [
      {
        orderLineId: 'line-1111-a',
        productTitle: 'Wireless Noise-Cancelling Headphones',
        variantLabel: 'Midnight',
        quantity: 1,
        unitPrice: 129.99,
        lineTotal: 129.99,
      },
    ],
    approvedAt: '2026-09-21T08:00:00Z',
    returnTrackingNumber: 'AZ-RET-88412',
  },
]

const SEED_ORDERS: Record<string, BuyerOrderDetail> = {
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
        refundRequestId: 'ref-1111',
        refundStatus: 'AWAITING_RETURN',
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
    refundRequests: refundRequests.map(({ id, reference, status, resolution, requestedAt, requestedAmount, approvedAmount, currency, orderId, orderReference, returnTrackingNumber }) => ({
      id,
      reference,
      status,
      resolution,
      requestedAt,
      requestedAmount,
      approvedAmount,
      currency,
      orderId,
      orderReference,
      returnTrackingNumber,
    })),
    canRequestRefund: false,
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
        refundRequestId: null,
        refundStatus: null,
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
    refundRequests: [],
    canRequestRefund: true,
    refundWindowEndsAt: '2026-10-16T09:00:00Z',
  },
}

export let orderDetails: Record<string, BuyerOrderDetail> = structuredClone(SEED_ORDERS)

/** The refund POST mutates orders now, so each test starts from the seed. */
export function resetBuyerOrders() {
  orderDetails = structuredClone(SEED_ORDERS)
}

function summaryOf(detail: BuyerOrderDetail): BuyerOrderSummary {
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
    openRefundRequestId: detail.refundRequests?.[0]?.id ?? null,
    openRefundStatus: detail.refundRequests?.[0]?.status ?? null,
  }
}

export function listBuyerOrders(): BuyerOrderSummary[] {
  return Object.values(orderDetails).map(summaryOf)
}

/**
 * What POST /api/v1/refund-requests does to the order it was raised against:
 * the order stops being eligible, and the new request shows on it. The real
 * backend enforces one open request per line, so a mock that kept saying
 * "yes, you may refund this" would hide exactly that class of bug.
 */
export function attachRefundToOrder(orderId: string, summary: RefundRequestSummary) {
  const order = orderDetails[orderId]
  if (!order) return
  order.canRequestRefund = false
  order.refundRequests = [...(order.refundRequests ?? []), summary]
}
