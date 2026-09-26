import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { ProductDetail } from '@/pages/ProductDetail'
import { SearchResults } from '@/pages/SearchResults'
import { StoreFront } from '@/pages/StoreFront'
import { addSellerProduct } from '@/test/msw/fixtures/sellerProducts'
import { systemCategories } from '@/test/msw/fixtures/categories'
import { server } from '@/test/msw/server'
import { SellerProducts } from '@/pages/seller/SellerProducts'

function wrap(children: React.ReactNode, path = '/') {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <CartProvider>
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

/**
 * The same category has to read the same way everywhere, and navigate by the same
 * value. Before this pass the display text and the filter value were the same string,
 * which meant renaming a category broke every saved filter - and the list of
 * categories was guessed from whatever products a sampled page returned.
 */
describe('categories across screens', () => {
  it('shows the display name on a product detail breadcrumb and filters by slug', async () => {
    wrap(
      <Routes>
        <Route path="/products/:productRef" element={<ProductDetail />} />
      </Routes>,
      '/products/wireless-noise-cancelling-headphones',
    )

    const crumb = await screen.findByRole('link', { name: 'Electronics' })
    expect(crumb).toHaveAttribute('href', '/search?category=electronics')
  })

  it('offers the whole system list in the search filter, by name', async () => {
    wrap(<SearchResults />, '/search')

    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))
    const listbox = within(screen.getByRole('listbox', { name: 'Category' }))

    for (const category of systemCategories) {
      expect(listbox.getByRole('option', { name: category.name })).toBeInTheDocument()
    }
    // Plus a way back out of a category filter.
    expect(listbox.getByRole('option', { name: 'All categories' })).toBeInTheDocument()
  })

  it('puts the chosen category in the URL as a slug', async () => {
    wrap(<SearchResults />, '/search')

    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))
    await userEvent.click(screen.getByRole('option', { name: 'Kitchen' }))

    // The filter chip reads as the name the shopper picked.
    expect(await screen.findByRole('button', { name: /Kitchen/ })).toBeInTheDocument()
  })

  it("names the categories a store actually lists, not the whole system list", async () => {
    wrap(
      <Routes>
        <Route path="/stores/:brand" element={<StoreFront />} />
      </Routes>,
      '/stores/Aurora%20Audio',
    )

    expect(await screen.findByRole('button', { name: 'Electronics' })).toBeInTheDocument()
    // In the system list, but not in this store's catalog.
    expect(screen.queryByRole('button', { name: 'Beauty' })).not.toBeInTheDocument()
  })

  it("shows the display name in the seller's product list", async () => {
    addSellerProduct({
      id: 'p-consistency',
      slug: 'consistency-product',
      title: 'Consistency Product',
      thumbnailUrl: null,
      category: { slug: 'home-garden', name: 'Home & Garden' },
      variantCount: 1,
      createdAt: '2026-01-01T00:00:00Z',
    })

    wrap(<SellerProducts />, '/seller/products')

    expect(await screen.findByText('Consistency Product')).toBeInTheDocument()
    // The name, ampersand and all - not the slug.
    expect(screen.getByText('Home & Garden')).toBeInTheDocument()
    expect(screen.queryByText('home-garden')).not.toBeInTheDocument()
  })

  /**
   * A category with nothing listed under it still appears in the selector. The old
   * derived list could not show one, because it was assembled from products.
   */
  it('offers categories that have no products yet', async () => {
    wrap(<SearchResults />, '/search')

    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))
    expect(screen.getByRole('option', { name: 'Beauty' })).toBeInTheDocument()
  })

  /** One request for the list, however many screens want it. */
  it('fetches the category list once and shares it', async () => {
    let requests = 0
    server.use(
      http.get('http://localhost:8080/categories', () => {
        requests++
        return HttpResponse.json(systemCategories)
      }),
    )

    const client = createAppQueryClient()
    render(
      <QueryClientProvider client={client}>
        <CartProvider>
          <MemoryRouter initialEntries={['/search']}>
            <SearchResults />
            <SearchResults />
          </MemoryRouter>
        </CartProvider>
      </QueryClientProvider>,
    )

    await screen.findAllByRole('combobox', { name: 'Category' })
    expect(requests).toBe(1)
  })
})
