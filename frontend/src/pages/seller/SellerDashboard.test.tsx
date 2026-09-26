import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { server } from '@/test/msw/server'
import { resetSellerOrders } from '@/test/msw/fixtures/sellerOrders'

import { SellerDashboard } from './SellerDashboard'

function renderPage() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <SellerDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The four queue widgets, in the order a browser that has never been told
 *  otherwise shows them. */
const WIDGET_TITLES = ['Orders to ship', 'Low stock', 'Recent orders', 'Refund requests']

function widgetTitles() {
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent ?? '')
    .filter((title) => WIDGET_TITLES.includes(title))
}

/** Everything a low-stock row carries apart from the bits each case sets. */
const LOW_STOCK_ROW = {
  id: 'p0',
  productRef: 'low-stock-product',
  title: 'Low stock product',
  brandName: null,
  thumbnailUrl: null,
  imageCount: 0,
  category: { slug: 'electronics', name: 'Electronics' },
  status: 'ACTIVE',
  variantCount: 1,
  totalStock: 0,
  priceFrom: 10,
  priceTo: 10,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

/** Five products, one per state the "vs prev" column has to tell apart. */
const TOP_PRODUCT_DELTAS = [
  { title: 'Rising Desk Lamp', units: 10, revenue: 1500, previousRevenue: 1000 },
  { title: 'Falling Desk Fan', units: 6, revenue: 750, previousRevenue: 1000 },
  // Null, not zero: it did not sell in the previous window, and nobody
  // measured a zero for it.
  { title: 'Brand New Mug', units: 4, revenue: 400, previousRevenue: null },
  { title: 'Off Zero Kettle', units: 5, revenue: 250, previousRevenue: 0 },
  { title: 'Steady Notebook', units: 3, revenue: 300, previousRevenue: 300 },
  { title: 'Runaway Phone Case', units: 40, revenue: 999, previousRevenue: 8 },
].map((row, index) => ({
  productId: `dddddddd-0000-0000-0000-00000000000${index}`,
  productRef: `delta-product-${index}`,
  thumbnailUrl: null,
  share: row.revenue / 3200,
  ...row,
}))

describe('SellerDashboard', () => {
  beforeEach(() => resetSellerOrders())

  it('shows the headline measures with their change against the previous window', async () => {
    renderPage()

    for (const label of ['Revenue', 'Orders']) {
      const tile = await screen.findByRole('group', { name: label })
      // Direction is words and an arrow, never colour alone.
      expect(within(tile).getByText(/vs prev/)).toBeInTheDocument()
    }
  })

  it('heads the page with the store, not with the word Dashboard', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Aurora Audio', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard', level: 1 })).not.toBeInTheDocument()
  })

  it('names the window it is showing and the window it is comparing against', async () => {
    renderPage()
    await screen.findByRole('tab', { name: 'Last 7 days' })

    await userEvent.click(screen.getByRole('tab', { name: 'Last 7 days' }))

    // Every measure on the page carries a delta; without this clause the
    // window those deltas are against is left for the seller to infer.
    expect(
      await screen.findByText(/· compared with the previous 7 days$/),
    ).toBeInTheDocument()
  })

  it('says the conversion rate is not tracked rather than printing a number for it', async () => {
    renderPage()

    const tile = await screen.findByRole('group', { name: 'Conversion rate' })
    expect(within(tile).getByText('Not tracked yet')).toBeInTheDocument()
    expect(within(tile).getByText('Store views are not recorded')).toBeInTheDocument()
    // Not a zero, not an estimate, and not a stale "vs prev" against either.
    expect(within(tile).queryByText(/%/)).not.toBeInTheDocument()
    expect(within(tile).queryByText(/vs prev/)).not.toBeInTheDocument()
    expect(within(tile).getByText('Not available')).toBeInTheDocument()
  })

  it('gives each chart panel the one fact its chart cannot state, and its total', async () => {
    renderPage()

    const revenue = (
      await screen.findByRole('heading', { name: 'Revenue', level: 2 })
    ).closest('section')!
    // findBy, not getBy: the panel is on screen while its query is in flight,
    // and a subtitle read off the series can only exist once the series does.
    expect(await within(revenue).findByText(/^Peak day \$/)).toBeInTheDocument()
    expect(within(revenue).getByText(/^\$[\d,]+\.\d\d$/)).toBeInTheDocument()

    const orders = screen.getByRole('heading', { name: 'Orders per day', level: 2 })
      .closest('section')!
    expect(within(orders).getByText(/^\d+\.\d per day$/)).toBeInTheDocument()

    // The top-products endpoint returns the best N and stops, so a full page
    // only proves there were at least that many - it must not name a total
    // nobody sent. The mock serves four against a limit of five, so this one
    // is genuinely the whole list.
    const top = (await screen.findByText('Top products by revenue')).closest('section')!
    expect(within(top).getByText('Top 4 of 4 products selling')).toBeInTheDocument()

    const categories = (await screen.findByText('Sales by category')).closest('section')!
    expect(within(categories).getByText('3 categories selling')).toBeInTheDocument()
  })

  it('refetches when the range changes', async () => {
    const ranges: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname === '/api/v1/sellers/me/metrics') ranges.push(url.searchParams.get('from')!)
    })

    renderPage()
    await screen.findByRole('tab', { name: 'Last 7 days' })

    await userEvent.click(screen.getByRole('tab', { name: 'Last 7 days' }))

    await waitFor(() => expect(new Set(ranges).size).toBeGreaterThan(1))
  })

  it('ranks top products by revenue share, with their units and a footer', async () => {
    renderPage()

    const panel = (await screen.findByText('Top products by revenue')).closest('section')!
    await within(panel).findByText('14" Ultrabook Laptop, 16GB RAM')
    // Row 0 is the header; the ranked products follow it in order.
    const rows = within(panel).getAllByRole('row')
    expect(within(rows[1]).getByRole('cell', { name: '1' })).toBeInTheDocument()
    expect(within(rows[1]).getByText('14" Ultrabook Laptop, 16GB RAM')).toBeInTheDocument()
    expect(within(rows[1]).getByText('31 units · $899.00 each')).toBeInTheDocument()
    expect(within(rows[1]).getByText('$27,869.00')).toBeInTheDocument()
    expect(within(rows[2]).getByRole('cell', { name: '2' })).toBeInTheDocument()

    // The footer measures the five against the whole window, so it names how
    // many it is actually showing rather than claiming a top five of four.
    expect(within(panel).getByText(/^Top 4 share of \$/)).toBeInTheDocument()
    expect(within(panel).getByText('$43,869.00')).toBeInTheDocument()
  })

  it('compares each top product with the same product in the window before', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/metrics/top-products', () =>
        HttpResponse.json(TOP_PRODUCT_DELTAS),
      ),
    )
    renderPage()

    const panel = (await screen.findByText('Top products by revenue')).closest('section')!
    await within(panel).findByText('Rising Desk Lamp')
    expect(within(panel).getByRole('columnheader', { name: 'vs prev' })).toBeInTheDocument()
    // Row 0 is the header; the five products follow in the order sent.
    const [, rising, falling, unsold, offZero, steady, runaway] =
      within(panel).getAllByRole('row')

    // A previous figure and a current one: a percentage, with an arrow so the
    // direction is never colour alone.
    const up = within(rising).getByText('+50.0%')
    expect(up).toHaveClass('text-[#1f7a45]')
    expect(up.querySelector('svg')).not.toBeNull()
    const down = within(falling).getByText('-25.0%')
    expect(down).toHaveClass('text-[#b42318]')
    expect(down.querySelector('svg')).not.toBeNull()

    // No previous figure at all: nothing was measured, so nothing is claimed -
    // not "New", and certainly not a percentage worked out against nothing.
    expect(within(unsold).getByText('No prior data')).toBeInTheDocument()
    expect(within(unsold).queryByText('New')).not.toBeInTheDocument()
    // The dash stands in for the words on screen, and no percentage is invented.
    expect(within(unsold).getAllByRole('cell').at(-1)).toHaveTextContent('—No prior data')

    // A measured zero is a different fact: a move off nothing, in the same
    // word the KPI tiles use, because a percentage here divides by zero.
    const off = within(offZero).getByText('New')
    expect(off).toHaveClass('text-[#1f7a45]')
    expect(off.querySelector('svg')).not.toBeNull()

    // Unchanged is flat, and reads as flat rather than as +0.0%.
    expect(within(steady).getByText('Flat')).toHaveClass('text-muted-foreground')

    // A rise has no ceiling, but the column does: past 999% it states the
    // bound rather than spilling a five-digit figure into the Share column.
    expect(within(runaway).getByText('>999%')).toHaveClass('text-[#1f7a45]')

    expect(panel.textContent).not.toMatch(/Infinity|NaN/)
  })

  it('builds its queue widgets from the existing lists, not new endpoints', async () => {
    resetSellerOrders([
      {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        buyerEmail: 'maya@example.com',
        placedAt: '2026-01-03T00:00:00Z',
        total: 50,
        status: 'PLACED',
        lines: [
          { id: 'l1', productTitle: 'Backpack', variantLabel: 'Blue', quantity: 2, unitPrice: 25, lineTotal: 50 },
        ],
      },
    ])
    renderPage()

    const panel = (await screen.findByText('Orders to ship')).closest('section')!
    expect(await within(panel).findByText('Maya')).toBeInTheDocument()
  })

  it('keeps a failed widget to itself, and retries just that widget', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/metrics/top-products', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Internal error', status: 500, detail: 'Top products are unavailable.' },
          { status: 500 },
        ),
      ),
    )
    renderPage()

    const panel = (await screen.findByText('Top products by revenue')).closest('section')!
    expect(
      await within(panel).findByText("Couldn't load top products", {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(within(panel).getByText('Top products are unavailable.')).toBeInTheDocument()
    // A failed list must not read as an empty one.
    expect(within(panel).queryByText('No sales in this window.')).not.toBeInTheDocument()
    // The rest of the dashboard is untouched by one broken endpoint.
    expect(await screen.findByRole('group', { name: 'Revenue' })).toBeInTheDocument()
    expect(await screen.findByText('Electronics')).toBeInTheDocument()

    // The endpoint recovers; the widget's own retry is enough to bring it back.
    server.resetHandlers()
    await userEvent.click(within(panel).getByRole('button', { name: 'Try again' }))

    expect(
      await within(panel).findByText('14" Ultrabook Laptop, 16GB RAM', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
  })

  it('surfaces a metrics failure with a retry', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/metrics', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Internal error', status: 500 },
          { status: 500 },
        ),
      ),
    )
    renderPage()

    expect(
      await screen.findByText("Couldn't load your dashboard", {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    // A failed metrics query is not a quiet window either: the charts say
    // nothing rather than reporting no activity.
    expect(screen.queryByText('No activity in this window.')).not.toBeInTheDocument()
  })

  it('holds a widget on its skeleton while the query is in flight, never on its empty copy', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/metrics/top-products', async () => {
        await held
        return HttpResponse.json([
          {
            productId: '22222222-2222-2222-2222-222222222222',
            productRef: 'slow-arrival-desk-lamp',
            title: 'Slow Arrival Desk Lamp',
            thumbnailUrl: null,
            units: 3,
            revenue: 120,
            share: 1,
          },
        ])
      }),
    )
    renderPage()

    const panel = (await screen.findByText('Top products by revenue')).closest('section')!
    await waitFor(() =>
      expect(panel.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0),
    )
    // The whole point: an unanswered query must not read as an answer of none.
    expect(within(panel).queryByText('No sales in this window.')).not.toBeInTheDocument()

    release()
    expect(await within(panel).findByText('Slow Arrival Desk Lamp')).toBeInTheDocument()
    expect(panel.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })

  it('shows the empty copy once a window really has come back with no sales', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/metrics/top-products', () =>
        HttpResponse.json([]),
      ),
    )
    renderPage()

    const panel = (await screen.findByText('Top products by revenue')).closest('section')!
    expect(await within(panel).findByText('No sales in this window.')).toBeInTheDocument()
    expect(panel.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })

  it('holds a queue widget on its skeleton before the queue is known to be empty', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/refund-requests', async () => {
        await held
        return HttpResponse.json({ content: [], page: 0, totalElements: 0, totalPages: 1 })
      }),
    )
    renderPage()

    const panel = (await screen.findByText('Refund requests')).closest('section')!
    await waitFor(() =>
      expect(panel.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5),
    )
    expect(within(panel).queryByText('Nothing waiting on a decision.')).not.toBeInTheDocument()

    // Empty is a fact once the answer is in, so the copy is right then.
    release()
    expect(await within(panel).findByText('Nothing waiting on a decision.')).toBeInTheDocument()
    expect(panel.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })

  it('keeps both chart cards on a window with no points instead of vanishing them', async () => {
    const zero = { views: null, orders: 0, revenue: 0, conversionRate: null, averageOrderValue: 0 }
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/metrics', ({ request }) => {
        const url = new URL(request.url)
        return HttpResponse.json({
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          currency: 'USD',
          totals: zero,
          previousTotals: zero,
          series: [],
        })
      }),
    )
    renderPage()

    const revenue = (
      await screen.findByRole('heading', { name: 'Revenue', level: 2 })
    ).closest('section')!
    expect(await within(revenue).findByText('No activity in this window.')).toBeInTheDocument()

    const orders = screen.getByRole('heading', { name: 'Orders per day', level: 2 }).closest('section')!
    expect(within(orders).getByText('No activity in this window.')).toBeInTheDocument()
  })

  it('lists the newest orders with their buyer, total and status', async () => {
    resetSellerOrders([
      {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        buyerEmail: 'maya@example.com',
        placedAt: '2026-01-03T00:00:00Z',
        total: 50,
        status: 'PLACED',
        lines: [
          { id: 'l1', productTitle: 'Backpack', variantLabel: 'Blue', quantity: 2, unitPrice: 25, lineTotal: 50 },
        ],
      },
      {
        id: 'aaaaaaaa-0000-0000-0000-000000000002',
        buyerEmail: 'rhea@example.com',
        placedAt: '2026-01-01T00:00:00Z',
        total: 163,
        status: 'SHIPPED',
        lines: [
          { id: 'l2', productTitle: 'Lamp', variantLabel: 'Standard', quantity: 1, unitPrice: 163, lineTotal: 163 },
        ],
      },
    ])
    renderPage()

    const panel = (await screen.findByText('Recent orders')).closest('section')!
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    // Newest first, and each row carries the buyer, the money and the status.
    expect(within(rows[0]).getByText('Maya')).toBeInTheDocument()
    expect(within(rows[0]).getByText('$50.00')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Placed')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Rhea')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Shipped')).toBeInTheDocument()
  })

  it('gives each queue row its action and its second line', async () => {
    resetSellerOrders([
      {
        id: 'aaaaaaaa-0000-0000-0000-000000000003',
        buyerEmail: 'maya@example.com',
        // Days old, so the queue says so rather than only colouring it.
        placedAt: '2026-01-03T00:00:00Z',
        total: 50,
        status: 'PLACED',
        lines: [
          { id: 'l1', productTitle: 'Backpack', variantLabel: 'Blue', quantity: 2, unitPrice: 25, lineTotal: 50 },
        ],
      },
    ])
    renderPage()

    const panel = (await screen.findByText('Orders to ship')).closest('section')!
    const row = (await within(panel).findAllByRole('listitem'))[0]
    expect(within(row).getByText('Maya')).toBeInTheDocument()
    expect(within(row).getByText(/2 items/)).toBeInTheDocument()
    expect(within(row).getByText(/waiting$/)).toBeInTheDocument()
    // The action names what it acts on, so five "Ship" links are five names.
    const ship = within(row).getByRole('link', { name: /^Ship/ })
    expect(ship).toHaveAttribute('href', '/seller/orders/aaaaaaaa-0000-0000-0000-000000000003')
  })

  it('draws the category split as a donut whose legend names every slice', async () => {
    renderPage()

    const panel = (await screen.findByText('Sales by category')).closest('section')!
    const legend = await within(panel).findAllByRole('listitem')
    expect(legend).toHaveLength(3)
    // Identity is never colour alone: each slice is named, with its share and
    // its money, beside the swatch.
    expect(within(legend[0]).getByText('Electronics')).toBeInTheDocument()
    expect(within(legend[0]).getByText('94%')).toBeInTheDocument()
    expect(within(legend[0]).getByText('$42,230.00')).toBeInTheDocument()
    expect(within(legend[1]).getByText('Kitchen')).toBeInTheDocument()
    expect(within(legend[2]).getByText('Outdoor')).toBeInTheDocument()

    // A ring with the window's total in the hole. The arcs themselves are laid
    // out from a measured box, which jsdom never gives recharts, so what the
    // ring is made of is checked in categoryPalette.test.ts instead.
    expect(within(panel).getByText('Total')).toBeInTheDocument()
    expect(panel.querySelector('[data-slot="chart"]')).not.toBeNull()
  })

  it('counts stock alerts as a headline measure, split into what they are', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/products', () =>
        HttpResponse.json({
          content: [
            { ...LOW_STOCK_ROW, id: 'p1', title: 'Out A', totalStock: 0 },
            { ...LOW_STOCK_ROW, id: 'p2', title: 'Out B', totalStock: 0 },
            { ...LOW_STOCK_ROW, id: 'p3', title: 'Low A', totalStock: 3 },
            { ...LOW_STOCK_ROW, id: 'p4', title: 'Low B', totalStock: 4 },
            { ...LOW_STOCK_ROW, id: 'p5', title: 'Low C', totalStock: 6 },
          ],
          page: 0,
          totalElements: 5,
          totalPages: 1,
        }),
      ),
    )
    renderPage()

    const tile = await screen.findByRole('group', { name: 'Stock alerts' })
    await within(tile).findByText('2 out of stock')
    expect(within(tile).getByText('5')).toBeInTheDocument()
    expect(within(tile).getByText('3 below 10 units')).toBeInTheDocument()
    // A count of alerts has no previous window, and saying so would be noise.
    expect(within(tile).queryByText('No prior data')).not.toBeInTheDocument()
  })

  it('will not state an out-of-stock count it cannot see the end of', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/products', () =>
        HttpResponse.json({
          content: Array.from({ length: 5 }, (_, i) => ({
            ...LOW_STOCK_ROW,
            id: `p${i}`,
            title: `Out ${i}`,
            totalStock: 0,
          })),
          page: 0,
          totalElements: 9,
          totalPages: 2,
        }),
      ),
    )
    renderPage()

    const tile = await screen.findByRole('group', { name: 'Stock alerts' })
    // The page ran out while the zero-stock products were still coming, so
    // four more could be either kind - the tile says what it knows.
    await within(tile).findByText('at least 5 out of stock')
    expect(within(tile).queryByText(/below 10 units/)).not.toBeInTheDocument()
  })

  it('moves a panel one place, and remembers it for the next visit', async () => {
    const first = renderPage()
    await screen.findByRole('heading', { name: 'Low stock', level: 2 })

    expect(widgetTitles()).toEqual([
      'Orders to ship',
      'Low stock',
      'Recent orders',
      'Refund requests',
    ])
    // The first panel has nowhere earlier to go.
    expect(screen.getByRole('button', { name: 'Move Orders to ship earlier' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Move Low stock earlier' }))
    expect(widgetTitles()).toEqual([
      'Low stock',
      'Orders to ship',
      'Recent orders',
      'Refund requests',
    ])

    // The order is this browser's preference, so it survives the page going away.
    first.unmount()
    renderPage()
    await screen.findByRole('heading', { name: 'Low stock', level: 2 })
    expect(widgetTitles()).toEqual([
      'Low stock',
      'Orders to ship',
      'Recent orders',
      'Refund requests',
    ])
  })

  it('falls back to the default order when the stored one is unusable', async () => {
    localStorage.setItem('amezo.seller-dashboard.widgets', 'not json')
    renderPage()

    await screen.findByRole('heading', { name: 'Low stock', level: 2 })
    expect(widgetTitles()).toEqual([
      'Orders to ship',
      'Low stock',
      'Recent orders',
      'Refund requests',
    ])
  })
})
