import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { useCartState } from '@/features/cart/context/CartContext'
import { CartProvider } from '@/features/cart/context/CartProvider'
import { ProductTile } from '@/features/catalog/components/ProductTile'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { SELLER_ONE, SELLER_TWO, seedProductBySlug } from '@/test/msw/fixtures/products'
import { clearSellerSession, signInBuyerSession, signInSellerSession } from '@/test/msw/fixtures/sellerAuth'
import { ProductDetail } from '@/pages/ProductDetail'

/** SELLER_ONE owns this one; SELLER_TWO does not. */
const OWNED_SLUG = 'wireless-noise-cancelling-headphones'

function CartReadout() {
  const { itemCount } = useCartState()
  return <span data-testid="count">{itemCount}</span>
}

function renderTile(slug = OWNED_SLUG) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <CartProvider>
        <MemoryRouter>
          <ProductTile product={seedProductBySlug(slug)} />
          <CartReadout />
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

function renderDetail(slug = OWNED_SLUG) {
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

describe("a seller's own product", () => {
  beforeEach(() => clearSellerSession())

  it('cannot be added to the cart from a card', async () => {
    signInSellerSession({ sellerId: SELLER_ONE, email: 'owner@example.com' })
    renderTile()

    const button = await screen.findByRole('button', { name: 'Your own product' })
    expect(button).toBeDisabled()
    // Belt and braces: even a forced click adds nothing.
    await userEvent.click(button, { pointerEventsCheck: 0 })
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('says so on the buy box, and the add button is dead', async () => {
    signInSellerSession({ sellerId: SELLER_ONE, email: 'owner@example.com' })
    renderDetail()

    expect(await screen.findByText("This is your own listing, so you can't buy it.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Your own product' })).toBeDisabled()
  })

  /** Another seller's product is an ordinary purchase. */
  it('is buyable by a different seller', async () => {
    signInSellerSession({ sellerId: SELLER_TWO, email: 'other@example.com' })
    renderTile()

    expect(await screen.findByRole('button', { name: 'Add to cart' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('is buyable by a signed-in buyer', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'buyer@example.com' })
    renderTile()

    expect(await screen.findByRole('button', { name: 'Add to cart' })).toBeEnabled()
  })

  /** And by an anonymous visitor, who cannot be anyone's seller. */
  it('is buyable by an anonymous visitor', async () => {
    renderTile()

    expect(await screen.findByRole('button', { name: 'Add to cart' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })
})
