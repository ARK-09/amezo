import { describe, expect, it } from 'vitest'

import type { components } from '@/lib/api/schema'

import { resetRefundRequests } from './refunds'
import { resetSellerOrders, type StoredSellerOrder } from './sellerOrders'

/**
 * The fixture layer is the contract the seller screens are written against, so
 * these go over HTTP the way the app's hooks do rather than calling the mappers
 * directly. Every case below covers a field the fixture used to answer with a
 * constant - what the seller posted came back once and was gone by the next
 * read, which hid the UI that depends on it behind data it could never get.
 */

type RefundRequestDetail = components['schemas']['RefundRequestDetail']

const ORDERS = 'http://localhost:8080/api/v1/sellers/me/orders'
const REFUNDS = 'http://localhost:8080/api/v1/refund-requests'
const ORDER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

function seedOrder(patch: Partial<StoredSellerOrder> = {}) {
  resetSellerOrders([
    {
      id: ORDER_ID,
      buyerEmail: 'maya@example.com',
      placedAt: '2026-01-03T00:00:00Z',
      total: 50,
      status: 'PLACED',
      lines: [
        { id: 'l1', productTitle: 'Backpack', variantLabel: 'Blue', quantity: 2, unitPrice: 25, lineTotal: 50 },
      ],
      ...patch,
    },
  ])
}

function seedRefund(patch: Partial<RefundRequestDetail> = {}) {
  resetRefundRequests([
    {
      id: 'ref-seeded',
      reference: 'ref_11223344',
      status: 'REQUESTED',
      resolution: 'REFUND',
      payout: 'ORIGINAL_PAYMENT',
      detail: 'A strap tore the first time the bag was carried with anything in it.',
      requestedAt: '2026-01-04T00:00:00Z',
      requestedAmount: 25,
      approvedAmount: null,
      currency: 'USD',
      orderId: ORDER_ID,
      orderReference: 'ord_00000001',
      orderPlacedAt: '2026-01-03T00:00:00Z',
      buyerName: 'Maya',
      buyerEmail: 'maya@example.com',
      lines: [
        { orderLineId: 'l1', productTitle: 'Backpack', variantLabel: 'Blue', quantity: 1, unitPrice: 25, lineTotal: 25 },
      ],
      ...patch,
    },
  ])
}

async function patchOrder(body: Record<string, unknown>) {
  const response = await fetch(`${ORDERS}/${ORDER_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await response.json()) as components['schemas']['SellerOrderRowDetail']
}

async function getOrder() {
  const response = await fetch(`${ORDERS}/${ORDER_ID}`)
  return (await response.json()) as components['schemas']['SellerOrderRowDetail']
}

async function getRow() {
  const response = await fetch(ORDERS)
  const page = (await response.json()) as components['schemas']['SellerOrderRowPage']
  return page.content.find((row) => row.id === ORDER_ID)!
}

describe('seller order fulfilment', () => {
  it('keeps the packing stamp and the parcel count on the order', async () => {
    seedOrder()

    const posted = await patchOrder({ status: 'PACKED', parcels: 3 })
    expect(posted.parcels).toBe(3)
    expect(posted.packedAt).toEqual(expect.any(String))

    // The PATCH used to spread these onto the response and store neither, so a
    // reload lost them and the fulfilment log could never say when the order
    // was packed, or into how many parcels.
    const reread = await getOrder()
    expect(reread.parcels).toBe(3)
    expect(reread.packedAt).toBe(posted.packedAt)
    expect(reread.status).toBe('PACKED')
  })

  it('keeps the packing stamp through the handover that follows it', async () => {
    seedOrder()
    const packed = await patchOrder({ status: 'PACKED', parcels: 2 })
    const shipped = await patchOrder({ status: 'SHIPPED' })

    expect(shipped.packedAt).toBe(packed.packedAt)
    expect(shipped.parcels).toBe(2)
    // The panel dates its "Handed over" step from the shipment, not the order.
    expect(shipped.shipment?.shippedAt).toEqual(expect.any(String))
  })
})

describe('seller order refund fields', () => {
  it('reports no open refund when nothing was raised against the order', async () => {
    seedOrder()

    expect((await getRow()).hasOpenRefund).toBe(false)
    expect((await getOrder()).refundRequests).toEqual([])
  })

  it('reports an open refund once one is raised against the order', async () => {
    seedOrder()
    seedRefund()

    expect((await getRow()).hasOpenRefund).toBe(true)
    const detail = await getOrder()
    expect(detail.refundRequests).toHaveLength(1)
    expect(detail.refundRequests?.[0].reference).toBe('ref_11223344')
  })

  it('leaves an order alone when the refund belongs to a different one', async () => {
    seedOrder()
    seedRefund({ orderId: 'bbbbbbbb-0000-0000-0000-000000000002' })

    expect((await getRow()).hasOpenRefund).toBe(false)
    expect((await getOrder()).refundRequests).toEqual([])
  })

  it('stops reporting an open refund once the request is settled', async () => {
    seedOrder()
    seedRefund()

    await fetch(`${REFUNDS}/ref-seeded`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'DECLINED', declineReason: 'Wear and tear' }),
    })

    // Settled, but not forgotten: the badge goes, the history stays.
    expect((await getRow()).hasOpenRefund).toBe(false)
    const detail = await getOrder()
    expect(detail.refundRequests).toHaveLength(1)
    expect(detail.refundRequests?.[0].status).toBe('DECLINED')
  })
})
