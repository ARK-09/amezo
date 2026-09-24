import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'

import { ProductDetail } from './ProductDetail'

function renderPage(productId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={[`/products/${productId}`]}>
          <Routes>
            <Route path="/products/:productId" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

const HEADPHONES_ID = '11111111-1111-1111-1111-111111111111'
const COOKWARE_ID = '33333333-3333-3333-3333-333333333333'

describe('ProductDetail', () => {
  it('renders product info and defaults to the Details tab', async () => {
    renderPage(HEADPHONES_ID)

    expect(await screen.findByRole('heading', { name: /Wireless Noise-Cancelling Headphones/ })).toBeInTheDocument()
    expect(screen.getByText(/over-ear headphones/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Details/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the not-found error state for an unknown product', async () => {
    renderPage('does-not-exist')
    expect(await screen.findByText("Couldn't load this product")).toBeInTheDocument()
  })

  it('switches price when a different variant is selected', async () => {
    renderPage(HEADPHONES_ID)
    await screen.findByRole('heading', { name: /Wireless/ })

    // price and subtotal both read $129.99 at qty 1 - two matches, both correct
    expect(screen.getAllByText('$129.99').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'White' }))
    expect(screen.getAllByText('$139.99').length).toBeGreaterThan(0)
    expect(screen.queryByText('$129.99')).not.toBeInTheDocument()
  })

  it('switches to the Reviews tab and lists reviews', async () => {
    renderPage(HEADPHONES_ID)
    await screen.findByRole('heading', { name: /Wireless/ })

    await userEvent.click(screen.getByRole('tab', { name: /Reviews/ }))
    expect(await screen.findByText('Jordan K.')).toBeInTheDocument()
  })

  it('shows no reviews for a product with none', async () => {
    renderPage(COOKWARE_ID)
    await screen.findByRole('heading', { name: /Cookware/ })

    await userEvent.click(screen.getByRole('tab', { name: /Reviews/ }))
    expect(await screen.findByText('No reviews yet.')).toBeInTheDocument()
  })

  it('adds the selected variant and quantity to the cart', async () => {
    renderPage(HEADPHONES_ID)
    await screen.findByRole('heading', { name: /Wireless/ })

    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    const stored = JSON.parse(localStorage.getItem('cart:v1') ?? '[]')
    expect(stored).toEqual([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 2, priceWhenAdded: 129.99 }])
  })
})
