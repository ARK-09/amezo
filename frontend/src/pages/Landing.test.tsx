import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
const SHOES = 'Trail Running Shoes'

describe('Landing', () => {
  it('leads with a hero built from a real listing, not invented campaign copy', async () => {
    renderPage()

    const hero = within(await screen.findByRole('region', { name: 'Featured' }))
    // first in-stock listing: Aurora Audio's headphones at $129.99
    expect(await hero.findByText('Aurora Audio')).toBeInTheDocument()
    expect(hero.getByText('From $129.99')).toBeInTheDocument()
    expect(hero.getByRole('link', { name: 'Shop now' })).toHaveAttribute(
      'href',
      '/products/11111111-1111-1111-1111-111111111111',
    )
  })

  it('advances the hero when a carousel dot is clicked', async () => {
    renderPage()

    const hero = within(await screen.findByRole('region', { name: 'Featured' }))
    await userEvent.click(await hero.findByRole('button', { name: 'Show featured product 2' }))

    expect(hero.getByText('From $899.00')).toBeInTheDocument()
    expect(hero.getByText(LAPTOP)).toBeInTheDocument()
  })

  /**
   * The rail comes from the system category list now, not from sampling whatever
   * products happened to come back - so it shows every category the marketplace has,
   * including ones with nothing listed in them yet, and links by the stable slug.
   */
  it('offers a tile per system category, linked by slug', async () => {
    renderPage()

    const rail = within(await screen.findByRole('region', { name: 'Explore popular categories' }))
    expect(rail.getByRole('link', { name: 'Electronics' })).toHaveAttribute(
      'href',
      '/search?category=electronics',
    )
    expect(rail.getByRole('link', { name: 'Outdoor' })).toHaveAttribute(
      'href',
      '/search?category=outdoor',
    )
    // Present in the system list but with nothing listed under it - the old derived
    // rail could never have shown this one.
    expect(rail.getByRole('link', { name: 'Beauty' })).toHaveAttribute(
      'href',
      '/search?category=beauty',
    )
  })

  it('keeps out-of-stock listings out of the picks rail but not new arrivals', async () => {
    renderPage()

    const picks = within(await screen.findByRole('region', { name: "Today's best picks for you" }))
    expect(await picks.findByText(LAPTOP)).toBeInTheDocument()
    expect(picks.queryByText(SHOES)).not.toBeInTheDocument()

    const fresh = within(screen.getByRole('region', { name: 'New this week' }))
    expect(await fresh.findByText(SHOES)).toBeInTheDocument()
  })

  /**
   * The rails name categories that actually have stock, in the system list's
   * merchandising order - so they never render a heading over an empty strip, which
   * is what following the head of the system list would do for a category nobody has
   * listed in yet.
   */
  it('builds the category rails from categories that have listings', async () => {
    renderPage()

    const electronics = within(
      await screen.findByRole('region', { name: 'Top picks in Electronics' }),
    )
    expect(await electronics.findByText(LAPTOP)).toBeInTheDocument()
    expect(electronics.queryByText(SHOES)).not.toBeInTheDocument()

    const footwear = within(await screen.findByRole('region', { name: 'Best sellers in Footwear' }))
    expect(await footwear.findByText(SHOES)).toBeInTheDocument()

    // Beauty is in the system list and has nothing listed, so it gets no rail - but
    // it is still in the navigation above.
    expect(screen.queryByRole('region', { name: /Beauty/ })).not.toBeInTheDocument()
  })

  it('points a promo tile at the featured seller storefront', async () => {
    renderPage()

    const tiles = within(await screen.findByRole('region', { name: 'Highlights' }))
    expect(await tiles.findByText('Aurora Audio')).toBeInTheDocument()
    const [, storeLink] = tiles.getAllByRole('link', { name: 'Shop now' })
    expect(storeLink).toHaveAttribute('href', '/stores/Aurora%20Audio')
  })

  it('runs the banner search against the catalog', async () => {
    renderPage()

    const banner = screen.getByRole('search', { name: 'Catalog search' })
    await userEvent.type(within(banner).getByLabelText('Search every seller'), 'laptop')
    await userEvent.click(within(banner).getByRole('button', { name: 'Search' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=laptop')
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
          { type: 'about:blank', title: 'Internal error', status: 500, detail: 'Query blew up' },
          { status: 500 },
        ),
      ),
    )
    renderPage()

    // The API's own words, not a fixed "Couldn't load these products" that would
    // describe a sleeping instance just as confidently as a broken query.
    expect((await screen.findAllByText('Query blew up')).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0)
  })

  /**
   * The same rails against a Render instance that is still booting. The landing
   * page is where a cold start is usually met, so it is the one place this
   * wording matters most.
   */
  it('says the server is starting up when a rail fails on a cold start', async () => {
    server.use(
      http.get(
        'http://localhost:8080/products',
        () =>
          new HttpResponse('<html>Bad gateway</html>', {
            status: 502,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    )
    renderPage()

    expect((await screen.findAllByText(/still be starting up/)).length).toBeGreaterThan(0)
  })
})
