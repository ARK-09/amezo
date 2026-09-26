import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { OrderCardDetail } from '@/features/orders/components/OrderCardDetail'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { seedProductBySlug } from '@/test/msw/fixtures/products'
import { givePurchase } from '@/test/msw/fixtures/purchases'
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
