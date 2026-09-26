import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { seedProducts } from '@/test/msw/fixtures/products'
import { server } from '@/test/msw/server'

import { SearchResults } from './SearchResults'

function renderPage(initialEntry = '/search') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <SearchResults />
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

/**
 * The grid's own page size is fixed and the catalogue is smaller than it, so
 * the server does the splitting here: three of the six seeded products a page.
 */
function pageTheCatalogue(size = 3) {
  server.use(
    http.get('http://localhost:8080/products', ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? 0)
      return HttpResponse.json({
        content: seedProducts.slice(page * size, page * size + size),
        page,
        totalElements: seedProducts.length,
        totalPages: Math.ceil(seedProducts.length / size),
      })
    }),
  )
}

describe('SearchResults', () => {
  it('shows a loading skeleton then the seeded products', async () => {
    renderPage()
    expect(
      await screen.findByText('Wireless Noise-Cancelling Headphones'),
    ).toBeInTheDocument()
    expect(screen.getByText('6 products')).toBeInTheDocument()
  })

  it('shows the query in the results header once searched', async () => {
    renderPage('/search?q=laptop')
    expect(await screen.findByText('14" Ultrabook Laptop, 16GB RAM')).toBeInTheDocument()
    expect(screen.getByText(/results for/)).toBeInTheDocument()
    expect(
      screen.queryByText('Wireless Noise-Cancelling Headphones'),
    ).not.toBeInTheDocument()
  })

  it('shows the no-results state for a query that matches nothing', async () => {
    renderPage('/search?q=doesnotexist')
    expect(await screen.findByText('No products found')).toBeInTheDocument()
  })

  it('shows the error state and can retry', async () => {
    server.use(
      http.get(
        'http://localhost:8080/products',
        () =>
          HttpResponse.json(
            { type: 'about:blank', title: 'Internal error', status: 500 },
            { status: 500 },
          ),
        { once: true },
      ),
    )
    renderPage()
    expect(await screen.findByText("Couldn't load products")).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByText('Wireless Noise-Cancelling Headphones'),
    ).toBeInTheDocument()
  })

  it('filters to in-stock only', async () => {
    renderPage()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    await userEvent.click(screen.getByLabelText('In stock only'))

    await waitFor(() =>
      expect(screen.queryByText('Trail Running Shoes')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByLabelText('Remove In stock only filter'),
    ).toBeInTheDocument()
  })

  it('pages by number', async () => {
    pageTheCatalogue()
    renderPage()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    const pager = within(screen.getByRole('navigation', { name: 'pagination' }))
    await userEvent.click(pager.getByRole('button', { name: '2' }))

    expect(await screen.findByText('Trail Running Shoes')).toBeInTheDocument()
    expect(
      screen.queryByText('Wireless Noise-Cancelling Headphones'),
    ).not.toBeInTheDocument()
    expect(pager.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
  })

  it('reads a page param that is not a number as the first page', async () => {
    pageTheCatalogue()
    // NaN used to reach the request, which answered with nothing at all.
    renderPage('/search?page=abc')

    expect(
      await screen.findByText('Wireless Noise-Cancelling Headphones'),
    ).toBeInTheDocument()
  })

  it('adds the default variant to the cart from the product card', async () => {
    renderPage()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    const [firstCardButton] = screen.getAllByRole('button', { name: 'Add to cart' })
    await userEvent.click(firstCardButton)

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('cart:v1') ?? '[]')
      expect(stored).toEqual([
        { variantId: '11111111-1111-1111-1111-111111111111-v1', quantity: 1, priceWhenAdded: 129.99 },
      ])
    })
  })
})
