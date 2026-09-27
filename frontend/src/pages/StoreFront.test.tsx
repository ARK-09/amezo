import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartProvider'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { server } from '@/test/msw/server'

import { StoreFront } from './StoreFront'

const API = 'http://localhost:8080'
const HANDLE = 'aurora-audio'

function store(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Aurora Audio',
    handle: HANDLE,
    status: 'OPEN',
    productCount: 5,
    inStockCount: 4,
    averageRating: 4.6,
    ratingCount: 1842,
    tagline: 'Audio and everyday tech, shipped from Dubai',
    about: 'Aurora Audio has sold headphones and everyday tech on Amezo since 2021.',
    location: 'Dubai, UAE',
    coverUrl: null,
    logoUrl: null,
    vacationNote: null,
    joinedAt: '2021-04-02T00:00:00Z',
    positiveRatingPct: 96,
    medianResponseMinutes: 95,
    following: false,
    policies: {
      shipping: 'Free over $50, 2–4 days',
      returns: '30 days, seller-paid',
      warranty: '12 months on electronics',
      shipsFrom: 'Dubai, UAE',
    },
    categories: [
      { slug: 'electronics', name: 'Electronics' },
      { slug: 'kitchen', name: 'Kitchen' },
    ],
    ...overrides,
  }
}

function product(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title,
    brandName: 'Aurora Audio',
    store: { id: '11111111-1111-1111-1111-111111111111', name: 'Aurora Audio', handle: HANDLE },
    category: { slug: 'electronics', name: 'Electronics' },
    priceFrom: 129.99,
    thumbnailUrl: null,
    avgRating: 4.5,
    reviewCount: 12,
    inStock: true,
    sellerId: '99999999-9999-9999-9999-999999999999',
    ...extra,
  }
}

/** Captures what the page actually asked the server for. */
let lastQuery: URLSearchParams | null = null

function seed(
  rows = [product('p1', 'Wireless Noise-Cancelling Headphones')],
  storeOverrides: Record<string, unknown> = {},
  totalPages = 1,
) {
  lastQuery = null
  server.use(
    http.get(`${API}/api/v1/stores/:handle`, () => HttpResponse.json(store(storeOverrides))),
    http.get(`${API}/api/v1/stores/:handle/products`, ({ request }) => {
      lastQuery = new URL(request.url).searchParams
      return HttpResponse.json({
        content: rows,
        page: 0,
        totalElements: rows.length,
        totalPages,
      })
    }),
  )
}

function renderStore(entry = `/stores/${HANDLE}`) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <CartProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/stores/:handle" element={<StoreFront />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

describe('StoreFront', () => {
  // The page used to pull one 100-row page of the whole catalogue and match on
  // brandName in the browser. Every figure on it was derived from whatever
  // happened to be in that page.
  it('reads the store from its own endpoint rather than scanning the catalogue', async () => {
    seed()
    renderStore()

    expect(await screen.findByRole('heading', { name: 'Aurora Audio' })).toBeInTheDocument()
    expect(screen.getByText(/Audio and everyday tech/)).toBeInTheDocument()
    expect(screen.getByText('Products').previousSibling).toHaveTextContent('5')
    expect(screen.getByText('Positive ratings').previousSibling).toHaveTextContent('96%')
    // 95 minutes rounds up to the next whole hour.
    expect(screen.getByText('Response time').previousSibling).toHaveTextContent('Under 2h')
    expect(screen.getByText('On Amezo').previousSibling).toHaveTextContent('Since 2021')
  })

  /**
   * The cover band's shape. The upload hint asks sellers for "1600 x 400 or wider"
   * - 4:1 - and the design's fixed 172px band is about 7.4:1 at this page's width, so
   * object-cover was throwing away more than half the height of every cover made to
   * that instruction. The two numbers cannot both be honoured and the seller acted on
   * the first one.
   */
  it('gives the cover a 4:1 band so a 1600x400 image is not cropped', async () => {
    seed(undefined, { coverUrl: 'https://cdn.example.com/cover.png' })
    renderStore()

    // alt="" - it is decorative, the store's name is the heading beside it - so there
    // is no accessible role to query it by.
    await screen.findByRole('heading', { name: 'Aurora Audio' })
    const cover = document.querySelector<HTMLImageElement>('img[src="https://cdn.example.com/cover.png"]')!
    expect(cover).not.toBeNull()
    const band = cover.parentElement!
    expect(band.className).toContain('aspect-[4/1]')
    expect(band.className).not.toContain('h-[172px]')
    // object-cover stays: a cover that is NOT 4:1 should still be trimmed rather than
    // squashed. For a 4:1 one it now has nothing to trim.
    expect(cover.className).toContain('object-cover')
  })

  /**
   * The logo tile straddles the cover's bottom edge, and is VISIBLE doing it.
   *
   * Every class asserted here was broken on its own, which is why each is named rather
   * than the lot being taken on trust:
   *
   *  - `relative`/`z-10`, because the cover band above is position:relative and CSS
   *    paints positioned elements above non-positioned ones whatever the source order.
   *    Without these the tile overlapped the band by a measured 44px and was painted
   *    underneath it, so only the half below the band showed;
   *  - `self-start`, because the row is items-end, which pins an item by its
   *    margin-box BOTTOM - so the negative margin beside it moved nothing at all;
   *  - `-mt-[44px]`, which then means what it says: half the tile over the band;
   *  - the shadow, because a white border on a white background separates nothing
   *    below the band.
   *
   * jsdom computes no layout and paints nothing, so the geometry and the paint order
   * are checked in Chromium; this is the guard on the classes that produce them.
   */
  it('lifts the store logo onto the cover with a shadow', async () => {
    seed(undefined, { logoUrl: 'https://cdn.example.com/logo.png' })
    renderStore()

    await screen.findByRole('heading', { name: 'Aurora Audio' })
    const tile = document.querySelector<HTMLElement>('img[src="https://cdn.example.com/logo.png"]')!
      .parentElement!
    expect(tile.className).toContain('relative')
    expect(tile.className).toContain('z-10')
    expect(tile.className).toContain('self-start')
    expect(tile.className).toContain('-mt-[44px]')
    expect(tile.className).toMatch(/shadow-\[/)
  })

  it('shows the about text and the seller’s own policies', async () => {
    seed()
    renderStore()

    expect(await screen.findByText(/has sold headphones/)).toBeInTheDocument()
    expect(screen.getByText('30 days, seller-paid')).toBeInTheDocument()
    expect(screen.getByText('12 months on electronics')).toBeInTheDocument()
  })

  /** A policy the seller never wrote is left out, not filled in for them. */
  it('leaves out a policy the seller has not written', async () => {
    seed(undefined, { policies: { shipping: 'Free over $50', returns: null, warranty: null } })
    renderStore()

    expect(await screen.findByText('Free over $50')).toBeInTheDocument()
    expect(screen.queryByText('Returns')).not.toBeInTheDocument()
    expect(screen.queryByText('Warranty')).not.toBeInTheDocument()
  })

  it('asks the server to filter, rather than filtering in the browser', async () => {
    seed()
    renderStore()
    await screen.findByRole('heading', { name: 'Aurora Audio' })

    await userEvent.type(screen.getByLabelText('Search in this store'), 'lamp')
    await waitFor(() => expect(lastQuery?.get('q')).toBe('lamp'))

    await userEvent.click(await screen.findByRole('button', { name: 'Kitchen' }))
    await waitFor(() => expect(lastQuery?.get('category')).toBe('kitchen'))

    await userEvent.selectOptions(screen.getByLabelText('Sort by:'), 'priceAsc')
    await waitFor(() => expect(lastQuery?.get('sort')).toBe('priceAsc'))
  })

  it('offers the categories this store lists, not the whole system list', async () => {
    seed()
    renderStore()

    expect(await screen.findByRole('button', { name: 'Electronics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kitchen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apparel' })).not.toBeInTheDocument()
  })

  /**
   * Follow and Message are DEFERRED, not broken. Neither endpoint exists:
   * PUT/DELETE /api/v1/stores/{handle}/follow has no store_follow table behind it and
   * POST its /messages has no seller inbox to arrive in. A button that looks like it
   * works and does not is worse than no button, so this asserts their absence rather
   * than asserting a mock.
   */
  it('does not offer follow or message while those endpoints do not exist', async () => {
    seed()
    renderStore()

    // The header has rendered, so this is absence and not just "not yet".
    await screen.findByRole('heading', { level: 1, name: 'Aurora Audio' })

    expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Follow/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Message' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Message' })).not.toBeInTheDocument()
  })

  it('says when the store is on holiday', async () => {
    seed(undefined, { status: 'VACATION', vacationNote: 'Back on the 8th.' })
    renderStore()

    expect(await screen.findByText(/on holiday/)).toBeInTheDocument()
    expect(screen.getByText(/Back on the 8th/)).toBeInTheDocument()
  })

  it('tells an empty filter apart from an empty store', async () => {
    seed([])
    renderStore(`/stores/${HANDLE}?q=nothing`)

    expect(await screen.findByText('Nothing here matches that')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('This store has no live listings')).toBeInTheDocument()
  })

  it('surfaces a failed store load with a retry', async () => {
    server.use(
      http.get(`${API}/api/v1/stores/:handle`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Not Found', status: 404, detail: 'No such store' },
          { status: 404 },
        ),
      ),
    )
    renderStore()

    expect(await screen.findByText("Couldn't load this store")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('links each listing to its product page by slug', async () => {
    seed()
    renderStore()

    const tile = await screen.findByText('Wireless Noise-Cancelling Headphones')
    expect(within(tile.closest('article')!).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/products/wireless-noise-cancelling-headphones',
    )
  })

})
