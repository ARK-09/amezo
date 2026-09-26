import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { ProductDetail } from '@/pages/ProductDetail'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { givePurchase } from '@/test/msw/fixtures/purchases'
import { seedProductBySlug } from '@/test/msw/fixtures/products'
import { clearSellerSession, signInBuyerSession, signInSellerSession } from '@/test/msw/fixtures/sellerAuth'
import { server } from '@/test/msw/server'

// A product with no seeded reviews, so what a test writes is the only one there.
const SLUG = 'ceramic-non-stick-cookware-set-10-piece'

function renderProduct(slug = SLUG) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <CartProvider>
        <MemoryRouter initialEntries={[`/products/${slug}`]}>
          <Routes>
            <Route path="/products/:productRef" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

async function openReviewsTab() {
  await userEvent.click(await screen.findByRole('tab', { name: /Reviews/ }))
}

describe('review flow', () => {
  beforeEach(() => clearSellerSession())

  /** A visitor gets a way in, not a form that would be refused. */
  it('asks an anonymous visitor to sign in', async () => {
    renderProduct()
    await openReviewsTab()

    const signIn = await screen.findByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('button', { name: /Publish review/ })).not.toBeInTheDocument()
  })

  /** Signed in, but hasn't bought it: told why, and given no form. */
  it('tells a buyer who has not purchased it that only buyers can review', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'buyer@example.com' })
    renderProduct()
    await openReviewsTab()

    expect(await screen.findByText('Only buyers can review this product.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Publish review/ })).not.toBeInTheDocument()
  })

  /**
   * A seller session is a session, and still not a buyer - the form must not appear
   * for it either.
   */
  it('does not offer the form to a signed-in seller', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'seller@example.com' })
    renderProduct()
    await openReviewsTab()

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Publish review/ })).not.toBeInTheDocument()
  })

  it('lets a buyer who bought it write a review, and shows it afterwards', async () => {
    const product = seedProductBySlug(SLUG)
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada.lovelace@example.com' })
    givePurchase(product.id, 'line-1')

    renderProduct()
    await openReviewsTab()

    await userEvent.click(await screen.findByRole('radio', { name: '5 stars' }))
    await userEvent.type(screen.getByLabelText(/Your review/), 'Cooks beautifully.')
    await userEvent.click(screen.getByRole('button', { name: 'Publish review' }))

    expect(await screen.findByText('Thanks — your review is published.')).toBeInTheDocument()
    expect(await screen.findByText('Cooks beautifully.')).toBeInTheDocument()
    // The reviewer is shown by name, derived from the email rather than printed raw.
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  /** A rating is required; a body is not. */
  it('will not submit without a rating', async () => {
    const product = seedProductBySlug(SLUG)
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'buyer@example.com' })
    givePurchase(product.id, 'line-1')

    renderProduct()
    await openReviewsTab()

    expect(await screen.findByRole('button', { name: 'Publish review' })).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: '3 stars' }))
    expect(screen.getByRole('button', { name: 'Publish review' })).toBeEnabled()
  })

  it('reports a second review of the same product instead of writing one', async () => {
    const product = seedProductBySlug(SLUG)
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'buyer@example.com' })
    givePurchase(product.id, 'line-1')

    const first = renderProduct()
    await openReviewsTab()
    await userEvent.click(await screen.findByRole('radio', { name: '4 stars' }))
    await userEvent.click(screen.getByRole('button', { name: 'Publish review' }))
    await screen.findByText('Thanks — your review is published.')

    // Coming back to the page is how a second attempt actually happens. Unmount first,
    // so the assertions are about the fresh visit rather than two mounted copies.
    first.unmount()
    renderProduct()
    await openReviewsTab()

    expect(await screen.findByText("You've already reviewed this product.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish review' })).not.toBeInTheDocument()
  })

  /** The API's refusal is shown, not swallowed. */
  it('surfaces a refusal from the server', async () => {
    const product = seedProductBySlug(SLUG)
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'buyer@example.com' })
    givePurchase(product.id, 'line-1')
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

    renderProduct()
    await openReviewsTab()
    await userEvent.click(await screen.findByRole('radio', { name: '5 stars' }))
    await userEvent.click(screen.getByRole('button', { name: 'Publish review' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That order line belongs to a different buyer',
    )
  })

  /** Eligibility is buyer-scoped, so nothing should ask for it anonymously. */
  it('does not ask about eligibility for a visitor who is not signed in', async () => {
    let asked = 0
    server.use(
      http.get('http://localhost:8080/products/:productRef/reviews/eligibility', () => {
        asked++
        return HttpResponse.json(
          { type: 'https://api/errors/unauthorized', title: 'Unauthorized', status: 401 },
          { status: 401 },
        )
      }),
    )

    renderProduct()
    await openReviewsTab()
    await screen.findByRole('link', { name: 'Sign in' })

    expect(asked).toBe(0)
  })
})
