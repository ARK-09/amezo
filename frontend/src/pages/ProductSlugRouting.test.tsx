import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { ProductTile } from '@/features/catalog/components/ProductTile'
import { seedProductBySlug, seedProducts } from '@/test/msw/fixtures/products'

import { ProductDetail } from './ProductDetail'

const SLUG = 'wireless-noise-cancelling-headphones'

function LocationReadout() {
  return <span data-testid="location">{useLocation().pathname}</span>
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <CartProvider>
        <MemoryRouter initialEntries={[path]}>
          <LocationReadout />
          <Routes>
            <Route path="/products/:productRef" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

describe('product URLs', () => {
  it('loads a product from its slug', async () => {
    renderAt(`/products/${SLUG}`)

    expect(
      await screen.findByRole('heading', { name: /Wireless Noise-Cancelling Headphones/ }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/products/${SLUG}`)
  })

  /**
   * The migration case: links minted before slugs existed are still out there, in
   * bookmarks and in other people's messages. They have to land on the product - and
   * then leave the reader on the slug URL, not the id one.
   */
  it('redirects a legacy id URL to the slug', async () => {
    const product = seedProductBySlug(SLUG)

    renderAt(`/products/${product.id}`)

    expect(
      await screen.findByRole('heading', { name: /Wireless Noise-Cancelling Headphones/ }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/products/${SLUG}`)
    expect(screen.getByTestId('location')).not.toHaveTextContent(product.id)
  })

  it('shows the not-found state for a slug nothing matches', async () => {
    renderAt('/products/no-such-product')

    expect(await screen.findByText("Couldn't load this product")).toBeInTheDocument()
  })

  /** A well-formed id for a product that isn't there must not redirect anywhere. */
  it('shows the not-found state for an unknown id', async () => {
    renderAt('/products/99999999-9999-9999-9999-999999999999')

    expect(await screen.findByText("Couldn't load this product")).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('99999999')
  })

  /**
   * Slugs are the only thing in the URL, and they need no escaping - which is the
   * point of generating them from the title rather than encoding the title.
   */
  it('uses slugs that need no URL encoding', () => {
    const product = seedProductBySlug('ceramic-non-stick-cookware-set-10-piece')
    expect(product.slug).toMatch(/^[a-z0-9-]+$/)
    expect(encodeURIComponent(product.slug)).toBe(product.slug)
    // The awkward characters in the title - parentheses, a hyphen, a comma - are gone
    // rather than escaped.
    expect(product.title).toContain('(10-piece)')
    expect(product.slug).toBe('ceramic-non-stick-cookware-set-10-piece')
  })

  /**
   * Checked where product links are actually minted - the card, which every listing
   * surface renders. No raw key should reach a URL.
   */
  it('never puts a raw id in a product link', async () => {
    render(
      <QueryClientProvider client={createAppQueryClient()}>
        <CartProvider>
          <MemoryRouter>
            {seedProducts.map((product) => (
              <ProductTile key={product.id} product={product} />
            ))}
          </MemoryRouter>
        </CartProvider>
      </QueryClientProvider>,
    )

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/products/'))

    // One per card: the image is also a link, but it is aria-hidden (the title beside
    // it is the accessible one), so it isn't in the accessibility tree.
    expect(hrefs.length).toBe(seedProducts.length)
    for (const href of hrefs) {
      expect(href).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
      expect(href).toMatch(/^\/products\/[a-z0-9-]+$/)
    }
  })
})
