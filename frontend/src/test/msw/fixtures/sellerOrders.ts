import type { components } from '@/lib/api/schema'

type SellerOrderDetail = components['schemas']['SellerOrderDetail']

// Demo-account starting orders (browser/dev only - every test resets this to
// [] via resetSellerOrders() in beforeEach/afterEach). Lines reference the
// same products as fixtures/sellerProducts.ts's DEMO_SEED. One of each
// status so the status filter and the "mark as shipped" action both have
// something to show.
const DEMO_SEED: SellerOrderDetail[] = [
  {
    id: 'd0000000-0000-0000-0000-000000000001',
    buyerEmail: 'alex@example.com',
    placedAt: '2026-09-23T14:12:00.000Z',
    total: 129.99,
    status: 'PLACED',
    lines: [
      {
        id: 'd0000000-0000-0000-0000-000000000001-line-1',
        productTitle: 'Wireless Noise-Cancelling Headphones',
        variantLabel: 'Black',
        quantity: 1,
        unitPrice: 129.99,
        lineTotal: 129.99,
      },
    ],
  },
  {
    id: 'd0000000-0000-0000-0000-000000000002',
    buyerEmail: 'priya@example.com',
    placedAt: '2026-09-22T09:45:00.000Z',
    total: 203,
    status: 'PLACED',
    lines: [
      {
        id: 'd0000000-0000-0000-0000-000000000002-line-1',
        productTitle: 'Mechanical Keyboard, Hot-Swappable',
        variantLabel: 'White',
        quantity: 1,
        unitPrice: 159,
        lineTotal: 159,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000002-line-2',
        productTitle: 'Stainless Steel Water Bottle, 32oz',
        variantLabel: 'Standard',
        quantity: 2,
        unitPrice: 22,
        lineTotal: 44,
      },
    ],
  },
  {
    id: 'd0000000-0000-0000-0000-000000000003',
    buyerEmail: 'morgan@example.com',
    placedAt: '2026-09-20T18:30:00.000Z',
    total: 899,
    status: 'SHIPPED',
    trackingNumber: '1Z999AA10123456784',
    shippedAt: '2026-09-21T16:05:00.000Z',
    lines: [
      {
        id: 'd0000000-0000-0000-0000-000000000003-line-1',
        productTitle: '14" Ultrabook Laptop, 16GB RAM',
        variantLabel: 'Standard',
        quantity: 1,
        unitPrice: 899,
        lineTotal: 899,
      },
    ],
  },
  {
    id: 'd0000000-0000-0000-0000-000000000004',
    buyerEmail: 'sam@example.com',
    placedAt: '2026-09-19T11:00:00.000Z',
    total: 96.5,
    status: 'SHIPPED',
    trackingNumber: '9400111899223197428490',
    shippedAt: '2026-09-19T22:15:00.000Z',
    lines: [
      {
        id: 'd0000000-0000-0000-0000-000000000004-line-1',
        productTitle: 'Ceramic Non-Stick Cookware Set (10-piece)',
        variantLabel: 'Standard',
        quantity: 1,
        unitPrice: 74.5,
        lineTotal: 74.5,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000004-line-2',
        productTitle: 'Stainless Steel Water Bottle, 32oz',
        variantLabel: 'Standard',
        quantity: 1,
        unitPrice: 22,
        lineTotal: 22,
      },
    ],
  },
  {
    id: 'd0000000-0000-0000-0000-000000000005',
    buyerEmail: 'jamie@example.com',
    placedAt: '2026-09-15T08:20:00.000Z',
    total: 139.99,
    status: 'DELIVERED',
    trackingNumber: '1Z999AA10198765436',
    shippedAt: '2026-09-15T20:00:00.000Z',
    lines: [
      {
        id: 'd0000000-0000-0000-0000-000000000005-line-1',
        productTitle: 'Wireless Noise-Cancelling Headphones',
        variantLabel: 'White',
        quantity: 1,
        unitPrice: 139.99,
        lineTotal: 139.99,
      },
    ],
  },
]

let orders: SellerOrderDetail[] = [...DEMO_SEED]

export function resetSellerOrders(seed: SellerOrderDetail[] = []) {
  orders = [...seed]
}

export function listSellerOrders(): SellerOrderDetail[] {
  return orders
}

export function findSellerOrder(id: string): SellerOrderDetail | undefined {
  return orders.find((order) => order.id === id)
}

export function updateSellerOrder(id: string, patch: Partial<SellerOrderDetail>): SellerOrderDetail | undefined {
  const order = findSellerOrder(id)
  if (!order) return undefined
  Object.assign(order, patch)
  return order
}

function total(order: Pick<SellerOrderDetail, 'lines'>) {
  return order.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
}

export function summaryOf(order: SellerOrderDetail) {
  return {
    id: order.id,
    buyerEmail: order.buyerEmail,
    placedAt: order.placedAt,
    total: total(order),
    status: order.status,
  }
}

// --- /api/v1/sellers/me/orders ---------------------------------------------
// Derived from the same store the unversioned endpoints serve. The older
// fixture carries no address or recipient (the old screens never showed one),
// so those are filled in here rather than duplicating the seed.

type SellerOrderRow = components['schemas']['SellerOrderRow']
type SellerOrderRowDetail = components['schemas']['SellerOrderRowDetail']

function recipientFor(order: SellerOrderDetail): string {
  const [name] = order.buyerEmail.split('@')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function addressFor(order: SellerOrderDetail) {
  return {
    fullName: recipientFor(order),
    line1: '418 Harrison Street',
    line2: null,
    city: 'Seattle',
    state: 'WA',
    postalCode: '98109',
    country: 'US',
  }
}

function referenceFor(order: SellerOrderDetail): string {
  return `ord_${order.id.replace(/-/g, '').slice(-8)}`
}

export function sellerOrderRowOf(order: SellerOrderDetail): SellerOrderRow {
  return {
    id: order.id,
    reference: referenceFor(order),
    buyerEmail: order.buyerEmail,
    recipientName: recipientFor(order),
    placedAt: order.placedAt,
    status: order.status,
    itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    total: order.total,
    currency: 'USD',
    destination: 'Seattle, WA',
    trackingNumber: order.trackingNumber ?? null,
    hasOpenRefund: false,
  }
}

export function sellerOrderRowDetailOf(order: SellerOrderDetail): SellerOrderRowDetail {
  // lineTotal is optional on the older shape; derive it when it is absent.
  const lineTotalOf = (line: SellerOrderDetail['lines'][number]) =>
    line.lineTotal ?? line.unitPrice * line.quantity
  const subtotal = order.lines.reduce((sum, line) => sum + lineTotalOf(line), 0)
  return {
    ...sellerOrderRowOf(order),
    lines: order.lines.map((line) => ({
      ...line,
      productRef: null,
      sku: null,
      lineTotal: lineTotalOf(line),
    })),
    subtotal,
    shipping: 0,
    tax: 0,
    total: order.total,
    shippingAddress: addressFor(order),
    shipment: {
      carrier: order.trackingNumber ? 'Amezo Logistics' : null,
      trackingNumber: order.trackingNumber ?? null,
      trackingUrl: null,
      estimatedDeliveryAt: null,
      deliveredAt: order.status === 'DELIVERED' ? order.shippedAt ?? null : null,
      deliveryNote: null,
    },
    packedAt: null,
    parcels: null,
    refundRequests: [],
  }
}

export function listSellerOrderRows(): SellerOrderRow[] {
  return listSellerOrders().map(sellerOrderRowOf)
}
