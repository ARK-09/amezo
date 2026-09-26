import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import {
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  createMemoryRouter,
  useLocation,
} from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthProvider'
import { routes } from '@/router'
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
    // By handle. The tile is handed the listing's store ref alongside the brand
    // string, so the link goes straight there instead of costing a redirect hop
    // through the legacy-name lookup.
    expect(storeLink).toHaveAttribute('href', '/stores/aurora-audio')
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

/**
 * The landing page still mints `/stores/<display name>` links - PromoTiles is handed a
 * brand string, not the listing's store ref - and links in that shape were handed out
 * before stores had handles. The store route has to land them on the store rather than
 * 404, and leave the reader on the handle URL.
 */
describe('legacy storefront URLs', () => {
  /** The real route table, so a URL is matched the way the app matches it. */
  function renderAt(initialEntry: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const testRouter = createMemoryRouter(routes, { initialEntries: [initialEntry] })
    render(
      <QueryClientProvider client={queryClient}>
        {/* App.tsx puts this above the router, and the header reads the seller
            flag from it - mounting `routes` directly has to supply it too. */}
        <SellerAuthProvider>
          <CartProvider>
            <RouterProvider router={testRouter} />
          </CartProvider>
        </SellerAuthProvider>
      </QueryClientProvider>,
    )
    return testRouter
  }

  it('lands a display-name link on the store and swaps the URL for its handle', async () => {
    const testRouter = renderAt('/stores/Aurora%20Audio')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Aurora Audio' }),
    ).toBeInTheDocument()
    expect(testRouter.state.location.pathname).toBe('/stores/aurora-audio')
  })

  it('takes a handle straight to the store, with no catalogue lookup', async () => {
    let catalogRequests = 0
    server.use(
      http.get('http://localhost:8080/products', () => {
        catalogRequests++
        return HttpResponse.json({ content: [], page: 0, totalElements: 0, totalPages: 1 })
      }),
    )

    const testRouter = renderAt('/stores/aurora-audio')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Aurora Audio' }),
    ).toBeInTheDocument()
    expect(testRouter.state.location.pathname).toBe('/stores/aurora-audio')
    // The lookup is the price of an old link, not of every storefront visit.
    expect(catalogRequests).toBe(0)
  })

  /**
   * A name nothing lists under is a dead link either way - but it has to die in the
   * storefront's own not-found, not hang on a redirect that never comes.
   */
  it("falls through to the store's own error state for an unknown name", async () => {
    const testRouter = renderAt('/stores/No%20Such%20Store')

    expect(await screen.findByText("Couldn't load this store")).toBeInTheDocument()
    // Left where it was: there is no handle to move it to.
    expect(testRouter.state.location.pathname).toBe('/stores/No%20Such%20Store')
  })
})
