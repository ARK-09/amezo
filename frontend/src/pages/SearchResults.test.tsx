import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
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
 * The catalogue holds six products, fewer than one default page, so the tests
 * that need a second page ask for ?size=5 - which the seeded handler honours,
 * the same way the real one does. This one is the sixth, alone on that page.
 */
const LAST_PRODUCT = 'Stainless Steel Water Bottle, 32oz'

/** What each request actually asked the server to page by. */
function askedParams() {
  const asked: { page: string | null; size: string | null }[] = []
  server.use(
    http.get('http://localhost:8080/products', ({ request }) => {
      const params = new URL(request.url).searchParams
      asked.push({ page: params.get('page'), size: params.get('size') })
      return undefined // fall through to the seeded handler
    }),
  )
  return asked
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
    renderPage('/search?size=5')
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    const pager = within(screen.getByRole('navigation', { name: 'pagination' }))
    await userEvent.click(pager.getByRole('button', { name: '2' }))

    expect(await screen.findByText(LAST_PRODUCT)).toBeInTheDocument()
    expect(
      screen.queryByText('Wireless Noise-Cancelling Headphones'),
    ).not.toBeInTheDocument()
    expect(pager.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
  })

  it('reads a page param that is not a number as the first page', async () => {
    // NaN used to reach the request, which answered with nothing at all.
    renderPage('/search?size=5&page=abc')

    expect(
      await screen.findByText('Wireless Noise-Cancelling Headphones'),
    ).toBeInTheDocument()
  })

  it('resizes the request and goes back to the first page when Per page changes', async () => {
    const asked = askedParams()
    renderPage('/search?size=5&page=1')
    await screen.findByText(LAST_PRODUCT)

    await userEvent.click(screen.getByLabelText('Rows per page'))
    await userEvent.click(await screen.findByRole('option', { name: '20' }))

    // Page 2 of a 5-a-page grid is nowhere in a 20-a-page one, so ?page= goes
    // with the size - the same reset every other filter does.
    await waitFor(() => expect(asked.at(-1)).toEqual({ page: '0', size: '20' }))
    expect(
      await screen.findByText('Wireless Noise-Cancelling Headphones'),
    ).toBeInTheDocument()
  })

  it('ignores a page size that is not a number', async () => {
    const asked = askedParams()
    renderPage('/search?size=abc')

    await screen.findByText('Wireless Noise-Cancelling Headphones')
    await waitFor(() => expect(asked.length).toBeGreaterThan(0))
    expect(asked.every((request) => request.size === '20')).toBe(true)
    expect(screen.getByLabelText('Rows per page')).toHaveTextContent('20')
  })

  it('ignores a page size that is not one of the offered ones', async () => {
    const asked = askedParams()
    // ?size=10000 asked for the whole catalogue in one response.
    renderPage('/search?size=10000')

    await screen.findByText('Wireless Noise-Cancelling Headphones')
    await waitFor(() => expect(asked.length).toBeGreaterThan(0))
    expect(asked.every((request) => request.size === '20')).toBe(true)
  })

  it('does not print a count past the end for a hand-typed page number', async () => {
    // The header did its own arithmetic and printed a start past the total
    // here - "1585 - 1584 over 6". Counting is the pager's now, and it clamps.
    renderPage('/search?size=5&page=99')

    expect(await screen.findByText('No products found')).toBeInTheDocument()
    expect(screen.getByText('6 products')).toBeInTheDocument()
  })

  it('counts a partial last page the way it fills it', async () => {
    // Six products five to a page: the last page holds the sixth alone, and the
    // range label is the only count on screen that knows which one it is.
    renderPage('/search?size=5&page=1')

    expect(await screen.findByText(LAST_PRODUCT)).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('Showing 6\u20136 of 6 products')).toBeInTheDocument()
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
