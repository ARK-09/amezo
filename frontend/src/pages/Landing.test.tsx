import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { server } from '@/test/msw/server'

import { Landing } from './Landing'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderPage(initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/search" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

const LAPTOP = '14" Ultrabook Laptop, 16GB RAM'

describe('Landing', () => {
  it('leads with the hero and its marketplace search box', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { name: /Everything you need, from sellers you can check/ }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Search the marketplace')).toBeInTheDocument()
  })

  it('spotlights the best-rated product that is actually in stock', async () => {
    renderPage()

    const spotlight = within(await screen.findByRole('region', { name: 'Top rated right now' }))
    expect(spotlight.getByRole('link', { name: LAPTOP })).toBeInTheDocument()
    expect(spotlight.getByText('$899.00')).toBeInTheDocument()
  })

  it('offers a tile per catalog category', async () => {
    renderPage()

    expect(await screen.findByRole('link', { name: 'Electronics' })).toHaveAttribute(
      'href',
      '/search?category=Electronics',
    )
    expect(screen.getByRole('link', { name: 'Outdoor' })).toHaveAttribute(
      'href',
      '/search?category=Outdoor',
    )
  })

  it('keeps out-of-stock products out of the trending rail but not new arrivals', async () => {
    renderPage()

    const trending = within(await screen.findByRole('region', { name: 'Trending this week' }))
    expect(await trending.findByText(LAPTOP)).toBeInTheDocument()
    expect(trending.queryByText('Trail Running Shoes')).not.toBeInTheDocument()

    const newest = within(screen.getByRole('region', { name: 'New arrivals' }))
    expect(await newest.findByText('Trail Running Shoes')).toBeInTheDocument()
  })

  it('points the rails and the seller band at the right destinations', async () => {
    renderPage()

    const newest = within(await screen.findByRole('region', { name: 'New arrivals' }))
    expect(newest.getByRole('link', { name: /See what's new/ })).toHaveAttribute(
      'href',
      '/search?sort=newest',
    )
    expect(screen.getByRole('link', { name: /Start selling/ })).toHaveAttribute(
      'href',
      '/seller/sign-in',
    )
  })

  it('hands a legacy "/?q=" link on to the search page instead of dropping the term', async () => {
    renderPage('/?q=laptop&inStockOnly=true')

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/search?q=laptop&inStockOnly=true',
    )
  })

  it('offers a retry when a rail cannot load', async () => {
    server.use(
      http.get('http://localhost:8080/products', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Internal error', status: 500 },
          { status: 500 },
        ),
      ),
    )
    renderPage()

    const rails = await screen.findAllByText("Couldn't load these products.")
    expect(rails).toHaveLength(2)
  })
})

