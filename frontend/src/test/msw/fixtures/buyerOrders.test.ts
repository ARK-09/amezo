import { beforeEach, describe, expect, it } from 'vitest'

import type { components } from '@/lib/api/schema'

import { signInBuyerSession } from './sellerAuth'

/**
 * The fixture layer is the contract the buyer's order screens are written
 * against, so these go over HTTP the way the app's hooks do rather than calling
 * the mappers directly. Every case below covers a refund field the order used
 * to answer from its own copy of the request: the copy was written when the
 * refund was raised and never again, so the buyer's card kept reporting a
 * status the seller had already moved on from.
 */

const ORDERS = 'http://localhost:8080/api/v1/orders'
const REFUNDS = 'http://localhost:8080/api/v1/refund-requests'

// The seeded in-transit order and the refund raised against it, which lives in
// fixtures/refunds.ts as the single record ref-3.
const IN_TRANSIT = 'order-1111'
const DELIVERED = 'order-2222'
const SEEDED_REFUND = 'ref-3'

async function summaryOf(orderId: string) {
  const response = await fetch(ORDERS)
  const page = (await response.json()) as components['schemas']['BuyerOrderSummaryPage']
  return page.content.find((order) => order.id === orderId)!
}

async function detailOf(orderId: string) {
  const response = await fetch(`${ORDERS}/${orderId}`)
  return (await response.json()) as components['schemas']['BuyerOrderDetail']
}

async function moveRefund(id: string, status: string, extra: Record<string, unknown> = {}) {
  const response = await fetch(`${REFUNDS}/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, ...extra }),
  })
  expect(response.status).toBe(200)
}

async function raiseRefund(orderId: string, orderLineId: string) {
  const response = await fetch(REFUNDS, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orderId,
      lines: [{ orderLineId, quantity: 1 }],
      resolution: 'REFUND',
      payout: 'ORIGINAL_PAYMENT',
      detail: 'The screen developed a dead pixel column about a week after it arrived.',
    }),
  })
  expect(response.status).toBe(201)
  return (await response.json()) as components['schemas']['RefundRequestDetail']
}

describe('buyer order refund fields', () => {
  // The orders endpoints are buyer routes and answer 401 without a session,
  // the way the real ones do.
  beforeEach(() => signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'maya@example.com' }))

  it('serves the one seeded record rather than a second copy of it', async () => {
    const detail = await detailOf(IN_TRANSIT)

    // The order carried its own ref-1111 with the same ref_90ce34aa reference
    // the store held as ref-3, so the two could disagree and only one of them
    // was reachable by id.
    expect(detail.refundRequests).toHaveLength(1)
    expect(detail.refundRequests?.[0].id).toBe(SEEDED_REFUND)
    expect(detail.refundRequests?.[0].reference).toBe('ref_90ce34aa')

    const byId = await fetch(`${REFUNDS}/${SEEDED_REFUND}`)
    expect(byId.status).toBe(200)
    expect(((await byId.json()) as { orderId: string }).orderId).toBe(IN_TRANSIT)
  })

  it('moves the order on when the seller settles a refund raised against it', async () => {
    expect((await summaryOf(IN_TRANSIT)).openRefundStatus).toBe('AWAITING_RETURN')
    expect((await detailOf(IN_TRANSIT)).lines[0].refundRequestId).toBe(SEEDED_REFUND)

    await moveRefund(SEEDED_REFUND, 'RETURN_RECEIVED')
    await moveRefund(SEEDED_REFUND, 'REFUNDED')

    // The regression: these three used to be seeded copies the refund PATCH
    // never touched, so the card badged "Return in progress" on an order the
    // seller had already paid back.
    const summary = await summaryOf(IN_TRANSIT)
    expect(summary.openRefundStatus).toBe('REFUNDED')
    expect(summary.openRefundRequestId).toBe(SEEDED_REFUND)

    const detail = await detailOf(IN_TRANSIT)
    expect(detail.refundRequests?.[0].status).toBe('REFUNDED')
    // Settled, but not forgotten: the line's "In refund" flag goes, the
    // request stays in the order's history.
    expect(detail.lines[0].refundRequestId).toBeNull()
    expect(detail.lines[0].refundStatus).toBeNull()
  })

  it('leaves an order alone when the refund belongs to a different one', async () => {
    const summary = await summaryOf(DELIVERED)

    expect(summary.openRefundRequestId).toBeNull()
    expect(summary.openRefundStatus).toBeNull()
    expect((await detailOf(DELIVERED)).refundRequests).toEqual([])
  })

  it('closes and reopens eligibility with the request the buyer raised', async () => {
    const order = await detailOf(DELIVERED)
    expect(order.canRequestRefund).toBe(true)

    const created = await raiseRefund(DELIVERED, order.lines[0].id)
    expect((await detailOf(DELIVERED)).canRequestRefund).toBe(false)

    await moveRefund(created.id, 'DECLINED', { declineReason: 'Wear and tear' })

    // The backend allows one open request per line, so a declined one lets the
    // buyer ask again. canRequestRefund used to be a flag set to false when the
    // request was posted and never set back.
    const settled = await detailOf(DELIVERED)
    expect(settled.canRequestRefund).toBe(true)
    expect(settled.refundRequests).toHaveLength(1)
    expect(settled.refundRequests?.[0].status).toBe('DECLINED')
  })
})
