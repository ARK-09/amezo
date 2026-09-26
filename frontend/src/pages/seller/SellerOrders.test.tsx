import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { resetSellerOrders } from '@/test/msw/fixtures/sellerOrders'

import { SellerOrders } from './SellerOrders'

function renderPage() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={['/seller/orders']}>
        <SellerOrders />
      </MemoryRouter>
    </QueryClientProvider>,
  )
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
