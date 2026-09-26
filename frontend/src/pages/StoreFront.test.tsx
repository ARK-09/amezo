import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'

import { StoreFront } from './StoreFront'

function renderStore(brand: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={[`/stores/${encodeURIComponent(brand)}`]}>
          <Routes>
            <Route path="/stores/:brand" element={<StoreFront />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

describe('StoreFront', () => {
  it('shows the seller header and only that seller’s listings', async () => {
    renderStore('Vexel')

    expect(await screen.findByRole('heading', { name: 'Vexel' })).toBeInTheDocument()
    expect(await screen.findByText('14" Ultrabook Laptop, 16GB RAM')).toBeInTheDocument()
    expect(screen.getByText('Mechanical Keyboard, Hot-Swappable')).toBeInTheDocument()
    expect(screen.queryByText('Wireless Noise-Cancelling Headphones')).not.toBeInTheDocument()
  })

  it('derives its stats from the listings rather than a seller profile', async () => {
    renderStore('Vexel')

    await screen.findByText('14" Ultrabook Laptop, 16GB RAM')
    expect(screen.getByText('Products').previousSibling).toHaveTextContent('2')
    // 4.8 and 4.6 average to 4.7
    expect(screen.getByText('Average rating').previousSibling).toHaveTextContent('4.7')
    expect(screen.getByText('In stock now').previousSibling).toHaveTextContent('2')
  })

  it('filters the storefront by category', async () => {
    renderStore('Hearth & Home')

    expect(await screen.findByText('Ceramic Non-Stick Cookware Set (10-piece)')).toBeInTheDocument()
    expect(screen.getByText('Stainless Steel Water Bottle, 32oz')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Kitchen' }))

    expect(screen.getByText('Ceramic Non-Stick Cookware Set (10-piece)')).toBeInTheDocument()
    expect(screen.queryByText('Stainless Steel Water Bottle, 32oz')).not.toBeInTheDocument()
  })

  it('reorders the grid when the sort changes', async () => {
    renderStore('Vexel')

    await screen.findByText('14" Ultrabook Laptop, 16GB RAM')
    await userEvent.selectOptions(screen.getByLabelText('Sort by:'), 'priceAsc')

    const titles = screen
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((text) => text?.includes('Keyboard') || text?.includes('Ultrabook'))
    expect(titles[0]).toContain('Keyboard')
  })

  it('explains itself when the seller has no listings', async () => {
    renderStore('Nobody')

    expect(await screen.findByText(/No store found for/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse all products' })).toHaveAttribute(
      'href',
      '/search',
    )
  })

  /** By slug, not by id - no raw database key appears in a product URL. */
  it('links each listing to its product page by slug', async () => {
    renderStore('Aurora Audio')

    const tile = await screen.findByText('Wireless Noise-Cancelling Headphones')
    expect(within(tile.closest('article')!).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/products/wireless-noise-cancelling-headphones',
    )
  })
})
