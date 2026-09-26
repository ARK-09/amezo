import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { resetSellerOrders } from '@/test/msw/fixtures/sellerOrders'
import { server } from '@/test/msw/server'

import { SellerOrders } from './SellerOrders'

function renderPage(initialEntry = '/seller/orders') {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SellerOrders />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** A real history, so a test can press Back the way a browser does. */
function renderWithHistory(entries: string[]) {
  const router = createMemoryRouter([{ path: '/seller/orders', Component: SellerOrders }], {
    initialEntries: entries,
    initialIndex: entries.length - 1,
  })
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const line = { id: 'l1', productTitle: 'Backpack', variantLabel: 'Blue', quantity: 2, unitPrice: 25, lineTotal: 50 }

function seedOrders() {
  resetSellerOrders([
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      buyerEmail: 'maya@example.com',
      placedAt: '2026-01-03T00:00:00Z',
      total: 50,
      status: 'PLACED',
      lines: [line],
    },
    {
      id: 'bbbbbbbb-0000-0000-0000-000000000002',
      buyerEmail: 'jonas@example.com',
      placedAt: '2026-01-01T00:00:00Z',
      total: 120,
      status: 'SHIPPED',
      trackingNumber: 'AZ123',
      lines: [{ ...line, unitPrice: 60, lineTotal: 120 }],
    },
  ])
}

describe('SellerOrders', () => {
  beforeEach(() => resetSellerOrders())

  it('shows the empty state with no orders', async () => {
    renderPage()
    expect(await screen.findByText('No orders here')).toBeInTheDocument()
  })

  it('lists orders newest first with recipient, items and total', async () => {
    seedOrders()
    renderPage()

    expect(await screen.findByText('Maya')).toBeInTheDocument()
    expect(screen.getByText('maya@example.com')).toBeInTheDocument()
    expect(screen.getByText('$50.00')).toBeInTheDocument()

    const [firstRow] = screen.getAllByRole('row').slice(1)
    expect(within(firstRow).getByText('Maya')).toBeInTheDocument()
  })

  it('filters by status', async () => {
    seedOrders()
    renderPage()
    await screen.findByText('Maya')

    await userEvent.click(screen.getByLabelText('Filter by status'))
    await userEvent.click(await screen.findByRole('option', { name: 'Shipped' }))

    expect(await screen.findByText('Jonas')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Maya')).not.toBeInTheDocument())
  })

  it('searches by recipient', async () => {
    seedOrders()
    renderPage()
    await screen.findByText('Maya')

    await userEvent.type(screen.getByLabelText('Search orders'), 'jonas')

    expect(await screen.findByText('Jonas')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Maya')).not.toBeInTheDocument())
  })

  it('leaves one history entry behind a typed search, and its own for a filter', async () => {
    seedOrders()
    const router = renderWithHistory(['/seller/orders'])
    await screen.findByText('Maya')

    await userEvent.type(screen.getByLabelText('Search orders'), 'jonas')
    await waitFor(() => expect(router.state.location.search).toBe('?q=jonas'))
    expect(await screen.findByText('Jonas')).toBeInTheDocument()

    // Every keystroke used to push, so escaping a five-letter search took five
    // Backs. One now lands on the list as it was before the typing started.
    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('Maya')).toBeInTheDocument()

    // A filter is a navigation, so it still leaves an entry to Back out of.
    await userEvent.click(screen.getByLabelText('Filter by status'))
    await userEvent.click(await screen.findByRole('option', { name: 'Shipped' }))
    await waitFor(() => expect(router.state.location.search).toBe('?status=SHIPPED'))

    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('Maya')).toBeInTheDocument()
  })

  it('floors a fractional page param before it reaches the request', async () => {
    let asked: string | null = 'never asked'
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/orders', ({ request }) => {
        asked = new URL(request.url).searchParams.get('page')
        return undefined // fall through to the default handler
      }),
    )
    seedOrders()
    renderPage('/seller/orders?page=1.7')

    await waitFor(() => expect(asked).toBe('1'))
  })

  it('clamps a negative page param to the first page', async () => {
    seedOrders()
    renderPage('/seller/orders?page=-3')

    // A negative offset used to reach the request, which answered with nothing.
    expect(await screen.findByText('Maya')).toBeInTheDocument()
  })

  it('puts the search box back in step with the URL when the filters are cleared', async () => {
    seedOrders()
    renderPage()
    await screen.findByText('Maya')

    const search = screen.getByLabelText('Search orders')
    await userEvent.type(search, 'jonas')
    await waitFor(() => expect(screen.queryByText('Maya')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    // The box used to keep the cleared term while the list behind it went back
    // to showing everything.
    expect(search).toHaveValue('')
    expect(await screen.findByText('Maya')).toBeInTheDocument()
  })

  it('opens the fulfilment drawer with a link to the same panel full page', async () => {
    seedOrders()
    renderPage()
    await screen.findByText('Maya')

    const [firstRow] = screen.getAllByRole('row').slice(1)
    await userEvent.click(within(firstRow).getByRole('button', { name: 'Open' }))

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByRole('link', { name: /Full page/ })).toHaveAttribute(
      'href',
      '/seller/orders/aaaaaaaa-0000-0000-0000-000000000001',
    )
    expect(await within(drawer).findByText('Fulfilment log')).toBeInTheDocument()
  })
})
