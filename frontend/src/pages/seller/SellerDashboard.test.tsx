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

describe('SellerDashboard', () => {
  beforeEach(() => resetSellerOrders())

  it('shows the headline measures with their change against the previous window', async () => {
    renderPage()

    for (const label of ['Revenue', 'Orders', 'Views', 'Conversion']) {
      const tile = await screen.findByRole('group', { name: label })
      // Direction is words and an arrow, never colour alone.
      expect(within(tile).getByText(/vs prev/)).toBeInTheDocument()
    }
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

  it('ranks top products by revenue share', async () => {
    renderPage()

    const panel = (await screen.findByText('Top products')).closest('section')!
    const rows = await within(panel).findAllByRole('listitem')
    expect(within(rows[0]).getByText('14" Ultrabook Laptop, 16GB RAM')).toBeInTheDocument()
    expect(within(rows[0]).getByText('$27,869.00')).toBeInTheDocument()
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

    const panel = (await screen.findByText('Waiting to ship')).closest('section')!
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

    const panel = (await screen.findByText('Top products')).closest('section')!
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

    const panel = (await screen.findByText('Top products')).closest('section')!
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

    const panel = (await screen.findByText('Top products')).closest('section')!
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

    const panel = (await screen.findByText('Refunds to review')).closest('section')!
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
    const zero = { views: 0, orders: 0, revenue: 0, conversionRate: 0, averageOrderValue: 0 }
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

    const orders = screen.getByRole('heading', { name: 'Orders', level: 2 }).closest('section')!
    expect(within(orders).getByText('No activity in this window.')).toBeInTheDocument()
  })
})
