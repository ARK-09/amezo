import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/test/msw/server'

import { SearchResults } from './SearchResults'

function renderPage(initialEntry = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SearchResults />
      </MemoryRouter>
    </QueryClientProvider>,
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
    renderPage('/?q=laptop')
    expect(await screen.findByText('14" Ultrabook Laptop, 16GB RAM')).toBeInTheDocument()
    expect(screen.getByText(/results for/)).toBeInTheDocument()
    expect(
      screen.queryByText('Wireless Noise-Cancelling Headphones'),
    ).not.toBeInTheDocument()
  })

  it('shows the no-results state for a query that matches nothing', async () => {
    renderPage('/?q=doesnotexist')
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
})
