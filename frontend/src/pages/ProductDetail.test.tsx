import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartProvider'
import { productDetails } from '@/test/msw/fixtures/productDetails'
import { server } from '@/test/msw/server'

import { ProductDetail } from './ProductDetail'

/** productRef is a slug, or a legacy id - the page accepts both. */
function renderPage(productRef: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={[`/products/${productRef}`]}>
          <Routes>
            <Route path="/products/:productRef" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

const HEADPHONES_SLUG = 'wireless-noise-cancelling-headphones'
const COOKWARE_SLUG = 'ceramic-non-stick-cookware-set-10-piece'
const HEADPHONES_ID = '11111111-1111-1111-1111-111111111111'

describe('ProductDetail', () => {
  it('renders product info and defaults to the Details tab', async () => {
    renderPage(HEADPHONES_SLUG)

    expect(await screen.findByRole('heading', { name: /Wireless Noise-Cancelling Headphones/ })).toBeInTheDocument()
    expect(screen.getByText(/over-ear headphones/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Details/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the not-found error state for an unknown product', async () => {
    renderPage('does-not-exist')
    expect(await screen.findByText("Couldn't load this product")).toBeInTheDocument()
  })

  it('switches price when a different variant is selected', async () => {
    renderPage(HEADPHONES_SLUG)
    await screen.findByRole('heading', { name: /Wireless/ })

    // price and subtotal both read $129.99 at qty 1 - two matches, both correct
    expect(screen.getAllByText('$129.99').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'White' }))
    expect(screen.getAllByText('$139.99').length).toBeGreaterThan(0)
    expect(screen.queryByText('$129.99')).not.toBeInTheDocument()
  })

  it('switches to the Reviews tab and lists reviews', async () => {
    renderPage(HEADPHONES_SLUG)
    await screen.findByRole('heading', { name: /Wireless/ })

    await userEvent.click(screen.getByRole('tab', { name: /Reviews/ }))
    expect(await screen.findByText('Jordan K.')).toBeInTheDocument()
  })

  it('shows no reviews for a product with none', async () => {
    renderPage(COOKWARE_SLUG)
    await screen.findByRole('heading', { name: /Cookware/ })

    await userEvent.click(screen.getByRole('tab', { name: /Reviews/ }))
    expect(await screen.findByText('No reviews yet.')).toBeInTheDocument()
  })

  /**
   * The storefront is addressed by a handle now. Both links to it on this page - the
   * breadcrumb crumb and "Sold by" - take it from the product's store ref; the display
   * name beside them is a label, not a key.
   */
  it('links to the storefront by handle', async () => {
    renderPage(HEADPHONES_SLUG)
    await screen.findByRole('heading', { name: /Wireless/ })

    const links = screen.getAllByRole('link', { name: 'Aurora Audio' })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/stores/aurora-audio')
    }
  })

  /**
   * `store` is optional in the contract. Without it the links fall back to the display
   * name, which the store route resolves - the one thing they must not do is guess a
   * handle by slugifying the name.
   */
  it('falls back to the display-name URL when the product names no store', async () => {
    const detail = { ...productDetails[HEADPHONES_SLUG] }
    delete detail.store
    server.use(
      http.get('http://localhost:8080/products/:productRef', () => HttpResponse.json(detail)),
    )

    renderPage(HEADPHONES_SLUG)
    await screen.findByRole('heading', { name: /Wireless/ })

    for (const link of screen.getAllByRole('link', { name: 'Aurora Audio' })) {
      expect(link).toHaveAttribute('href', '/stores/Aurora%20Audio')
    }
  })

  it('adds the selected variant and quantity to the cart', async () => {
    renderPage(HEADPHONES_SLUG)
    await screen.findByRole('heading', { name: /Wireless/ })

    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    const stored = JSON.parse(localStorage.getItem('cart:v1') ?? '[]')
    expect(stored).toEqual([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 2, priceWhenAdded: 129.99 }])
  })

  // The design fills Delivery and Returns with fixed marketing copy. Printing
  // that on every listing would promise terms the platform does not set, so both
  // come from the store's own policies - and a policy the seller never wrote is
  // left out rather than invented.
  it('prints the SKU and the seller’s own delivery and returns terms', async () => {
    renderPage('wireless-noise-cancelling-headphones')

    expect(await screen.findByText('SKU')).toBeInTheDocument()
    expect(await screen.findByText('Delivery')).toBeInTheDocument()
    expect(screen.getByText('Returns')).toBeInTheDocument()
  })

  it('shows the specification table under Details, and nothing when there is none', async () => {
    renderPage('wireless-noise-cancelling-headphones')

    await userEvent.click(await screen.findByRole('tab', { name: /Details/ }))
    expect(await screen.findByText('Battery life')).toBeInTheDocument()
    expect(screen.getByText('Bluetooth 5.3, USB-C')).toBeInTheDocument()

    cleanup()
    renderPage('trail-running-shoes')
    await userEvent.click(await screen.findByRole('tab', { name: /Details/ }))
    expect(screen.queryByText('Battery life')).not.toBeInTheDocument()
  })
})
