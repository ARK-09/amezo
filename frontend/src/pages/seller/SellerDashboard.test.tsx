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
  })
})
