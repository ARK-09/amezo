import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { OrderCardDetail } from '@/features/orders/components/OrderCardDetail'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { seedProductBySlug } from '@/test/msw/fixtures/products'
import { givePurchase } from '@/test/msw/fixtures/purchases'
import { listRefundRequests, resetRefundRequests } from '@/test/msw/fixtures/refunds'
import { clearSellerSession, signInBuyerSession } from '@/test/msw/fixtures/sellerAuth'
import { server } from '@/test/msw/server'

// order-2222 is the delivered seed order: one line, one product, so the Reviews
// block under it has exactly one card to assert on.
const DELIVERED_ORDER = 'order-2222'
const DELIVERED_LINE = 'line-2222-a'
const PRODUCT_SLUG = '14-ultrabook-laptop-16gb-ram'

function renderDetail(orderId = DELIVERED_ORDER) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <OrderCardDetail orderId={orderId} />
    </QueryClientProvider>,
  )
}

/** The buyer whose order this is, with the purchase the mock checks a review against. */
function signInAsTheBuyer() {
  const product = seedProductBySlug(PRODUCT_SLUG)
  signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'rhea.patel@example.com' })
  givePurchase(product.id, DELIVERED_LINE)
}

/** Every request MSW sees, so a test can assert the PATCH happened and not just its effect. */
function recordRequests() {
  const calls: { method: string; url: string }[] = []
  server.events.on('request:start', ({ request }) => {
    calls.push({ method: request.method, url: request.url })
  })
  return calls
}

function editor() {
  return screen.getByRole('textbox', { name: /Your review of/ })
}

describe('reviews inside an expanded order', () => {
  beforeEach(() => clearSellerSession())
  afterEach(() => server.events.removeAllListeners())

  it('opens the editor when a rating is picked', async () => {
    signInAsTheBuyer()
    renderDetail()

    expect(await screen.findByText('Pick a rating to write a review.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }))

    expect(editor()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByText('0/500')).toBeInTheDocument()
    expect(screen.getByText('4 of 5')).toBeInTheDocument()
    expect(screen.queryByText('Pick a rating to write a review.')).not.toBeInTheDocument()
  })

  it('writes the review and then shows it as published', async () => {
    signInAsTheBuyer()
    renderDetail()

    await userEvent.click(await screen.findByRole('radio', { name: '5 stars' }))
    await userEvent.type(editor(), 'Quiet, quick, and the battery lasts.')
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }))

    expect(await screen.findByText('Quiet, quick, and the battery lasts.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit review' })).toBeInTheDocument()
    expect(screen.getByText(/^Posted /)).toBeInTheDocument()
    expect(screen.getByText('5 of 5')).toBeInTheDocument()
    // The editor is gone, not merely emptied.
    expect(screen.queryByRole('button', { name: 'Post review' })).not.toBeInTheDocument()
  })

  it('edits a published review with a PATCH', async () => {
    signInAsTheBuyer()
    const calls = recordRequests()
    renderDetail()

    await userEvent.click(await screen.findByRole('radio', { name: '3 stars' }))
    await userEvent.type(editor(), 'Good enough.')
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }))
    await screen.findByText('Good enough.')

    await userEvent.click(screen.getByRole('button', { name: 'Edit review' }))
    await userEvent.clear(editor())
    await userEvent.type(editor(), 'Better than I first thought.')
    await userEvent.click(screen.getByRole('radio', { name: '5 stars' }))
    await userEvent.click(screen.getByRole('button', { name: 'Update review' }))

    expect(await screen.findByText('Better than I first thought.')).toBeInTheDocument()
    expect(screen.getByText('5 of 5')).toBeInTheDocument()
    expect(
      calls.some((call) => call.method === 'PATCH' && /\/api\/v1\/reviews\/.+$/.test(call.url)),
    ).toBe(true)
  })

  it('keeps the editor open and shows what the server said when a write is refused', async () => {
    signInAsTheBuyer()
    server.use(
      http.post('http://localhost:8080/reviews', () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/forbidden',
            title: 'Forbidden',
            status: 403,
            detail: 'That order line belongs to a different buyer',
          },
          { status: 403 },
        ),
      ),
    )
    renderDetail()

    await userEvent.click(await screen.findByRole('radio', { name: '5 stars' }))
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That order line belongs to a different buyer',
    )
    // The draft survives the refusal - retyping it would be the punishment.
    expect(editor()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post review' })).toBeInTheDocument()
  })

  it('offers no reviews on an order that has not arrived', async () => {
    signInAsTheBuyer()
    // order-1111 is still in transit, and the server would refuse a review for it.
    renderDetail('order-1111')

    await screen.findByRole('heading', { name: 'Items' })
    expect(screen.queryByRole('heading', { name: 'Reviews' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '5 stars' })).not.toBeInTheDocument()
  })
})

/** The order the seeded refund (ref-3, awaiting its return) was raised against. */
const REFUNDED_ORDER = 'order-1111'
const SEEDED_REFUND = 'ref-3'

type SeededRefund = ReturnType<typeof listRefundRequests>[number]

/** Moves the seeded request on the way the seller's queue would. */
async function moveRefund(status: SeededRefund['status'], extra: Record<string, unknown> = {}) {
  const response = await fetch(`http://localhost:8080/api/v1/refund-requests/${SEEDED_REFUND}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, ...extra }),
  })
  expect(response.status).toBe(200)
}

/**
 * Starts the seeded request from a given state. Not a PATCH: the mock enforces the
 * real transition map, and "declined" is not reachable from the awaiting-return
 * state this request is seeded in - so a test that wants a declined request has to
 * be given one rather than walking there through moves the server would refuse.
 */
function seedRefundAs(status: SeededRefund['status'], extra: Partial<SeededRefund> = {}) {
  resetRefundRequests(
    structuredClone(listRefundRequests()).map((refund) =>
      refund.id === SEEDED_REFUND ? { ...refund, status, ...extra } : refund,
    ),
  )
}

describe('the items block of an expanded order', () => {
  beforeEach(() => signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'rhea@example.com' }))

  it('prints the variant, quantity and unit price on every line', async () => {
    renderDetail()

    // "Silver · Qty 1 · $899.00" - the unit price used to be dropped.
    expect(await screen.findByText('Silver · Qty 1 · $899.00')).toBeInTheDocument()
  })

  it('sets the order total apart from the parts of it', async () => {
    renderDetail()

    await screen.findByRole('heading', { name: 'Items' })
    // "Items" is both the section heading and the subtotal's label, so the rows
    // are read off the block rather than off the page.
    const rows = within(screen.getByText('Total').closest('div')!.parentElement!)
    for (const label of ['Items', 'Shipping', 'Tax', 'Total']) {
      expect(rows.getByText(label)).toBeInTheDocument()
    }
    // Free shipping is a word, not $0.00, and the total is the charged figure.
    expect(rows.getByText('Free')).toBeInTheDocument()
    expect(rows.getByText('$907.91')).toBeInTheDocument()
  })

  it('tags a line while its refund runs, and again once the money is back', async () => {
    renderDetail(REFUNDED_ORDER)

    expect(await screen.findByText('IN REFUND')).toBeInTheDocument()
    expect(screen.queryByText('REFUNDED')).not.toBeInTheDocument()
  })

  it('keeps the tag on a settled refund, which the line itself no longer carries', async () => {
    // Once the request closes, BuyerOrderLine.refundStatus is cleared - the
    // contract sets it only while the request is open - so the request's own line
    // list is the only thing that still says which line the money came back on.
    await moveRefund('RETURN_RECEIVED')
    await moveRefund('REFUNDED')
    renderDetail(REFUNDED_ORDER)

    expect(await screen.findByText('REFUNDED')).toBeInTheDocument()
    expect(screen.queryByText('IN REFUND')).not.toBeInTheDocument()
  })

  it('leaves no tag on a line whose request was declined', async () => {
    seedRefundAs('DECLINED', { declineReason: 'Wear and tear' })
    renderDetail(REFUNDED_ORDER)

    await screen.findByRole('heading', { name: 'Items' })
    expect(screen.queryByText('IN REFUND')).not.toBeInTheDocument()
    expect(screen.queryByText('REFUNDED')).not.toBeInTheDocument()
  })
})

/**
 * What the real backend serves today: three timeline stages rather than the design's
 * six, no shipment, no payment, no refunds, and shipping and tax genuinely zero. The
 * panel must render what arrives and draw nothing for what does not.
 */
describe('against an order with nothing optional on it', () => {
  beforeEach(() => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'rhea@example.com' })
    server.use(
      http.get('http://localhost:8080/api/v1/orders/:orderId', () =>
        HttpResponse.json({
          id: 'order-bare',
          reference: 'ord_bare',
          placedAt: '2026-09-10T00:00:00Z',
          status: 'DELIVERED',
          seller: { id: 'seller-1', name: 'Aurora Audio', handle: 'aurora-audio' },
          lines: [
            {
              id: 'line-bare',
              productRef: 'trail-running-shoes',
              productTitle: 'Trail Running Shoes',
              variantLabel: 'UK 9',
              quantity: 1,
              unitPrice: 119,
              lineTotal: 119,
              refundRequestId: null,
              refundStatus: null,
            },
          ],
          subtotal: 119,
          shipping: 0,
          tax: 0,
          total: 119,
          currency: 'USD',
          timeline: [
            { code: 'PLACED', label: 'Order placed', at: '2026-09-10T00:00:00Z', estimated: false, completed: true, detail: null },
            { code: 'SHIPPED', label: 'Shipped', at: '2026-09-11T00:00:00Z', estimated: false, completed: true, detail: null },
            { code: 'DELIVERED', label: 'Delivered', at: '2026-09-13T00:00:00Z', estimated: false, completed: true, detail: null },
          ],
          shipment: null,
          shippingAddress: {
            fullName: 'Rhea Patel',
            line1: '118 Ferndale Road',
            city: 'Portland',
            state: 'OR',
            postalCode: '97214',
            country: 'US',
          },
          billingAddress: null,
          payment: null,
          refundRequests: [],
          canRequestRefund: true,
          refundWindowEndsAt: null,
        }),
      ),
    )
  })

  it('renders the stages it was given and pads nothing to six', async () => {
    renderDetail('order-bare')

    expect(await screen.findByText('Order placed')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('Packed')).not.toBeInTheDocument()
  })

  it('draws no refund panel and no "Paid with" block for data that does not exist', async () => {
    renderDetail('order-bare')

    await screen.findByRole('heading', { name: 'Items' })
    expect(screen.queryByText('Paid with')).not.toBeInTheDocument()
    expect(screen.queryByText(/Refund/)).not.toBeInTheDocument()
    expect(screen.queryByText('IN REFUND')).not.toBeInTheDocument()
    // Zero shipping and zero tax are the true figures, not placeholders.
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })
})

describe('the refund panel inside an expanded order', () => {
  beforeEach(() => signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'rhea@example.com' }))

  it('names the state and the sentence the design gives it', async () => {
    renderDetail(REFUNDED_ORDER)

    expect(
      await screen.findByRole('heading', { name: 'Refund approved — send the item back' }),
    ).toBeInTheDocument()
    expect(screen.getByText('ref_90ce34aa')).toBeInTheDocument()
    // The product, the label and the money all come off the request itself.
    expect(
      await screen.findByText(
        /Drop Wireless Noise-Cancelling Headphones at any carrier point using label AZ-RET-88412\. \$129\.99 is released/,
      ),
    ).toBeInTheDocument()
  })

  it('reads the decline reason off the request', async () => {
    seedRefundAs('DECLINED', { declineReason: 'Item shows signs of use' })
    renderDetail(REFUNDED_ORDER)

    expect(await screen.findByRole('heading', { name: 'Refund declined' })).toBeInTheDocument()
    expect(
      await screen.findByText('The seller declined this request: Item shows signs of use.'),
    ).toBeInTheDocument()
  })

  it('lets the buyer cancel a request the seller has not answered', async () => {
    const calls = recordRequests()
    // REQUESTED is the only state the buyer may withdraw from.
    seedRefundAs('REQUESTED')
    renderDetail(REFUNDED_ORDER)

    const cancel = await screen.findByRole('button', { name: 'Cancel request' })
    await userEvent.click(cancel)

    expect(await screen.findByRole('heading', { name: 'Refund cancelled' })).toBeInTheDocument()
    expect(
      calls.some((call) => call.method === 'PATCH' && call.url.includes('/refund-requests/')),
    ).toBe(true)
    // Withdrawn, so there is nothing left to withdraw from.
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument()
  })

  it('offers no cancel once the seller has acted', async () => {
    renderDetail(REFUNDED_ORDER)

    // The seeded request is already approved and awaiting its return; the server
    // refuses a cancel from here, so the button is not offered.
    await screen.findByRole('heading', { name: 'Refund approved — send the item back' })
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument()
  })

  it('says what the server said when a cancel is refused', async () => {
    server.use(
      http.patch('http://localhost:8080/api/v1/refund-requests/:id', () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/illegal-transition',
            title: 'Illegal transition',
            status: 409,
            detail: 'Cannot move from APPROVED to CANCELLED',
          },
          { status: 409 },
        ),
      ),
    )
    seedRefundAs('REQUESTED')
    renderDetail(REFUNDED_ORDER)

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot move from APPROVED to CANCELLED',
    )
  })
})
