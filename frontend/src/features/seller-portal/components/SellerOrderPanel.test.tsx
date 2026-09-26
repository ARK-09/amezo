import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { resetSellerOrders } from '@/test/msw/fixtures/sellerOrders'

import { SellerOrderPanel } from './SellerOrderPanel'

const ORDER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

function renderPanel(orderId = ORDER_ID) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <SellerOrderPanel orderId={orderId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function seed(status: 'PLACED' | 'PACKED' | 'SHIPPED' | 'DELIVERED' = 'PLACED') {
  resetSellerOrders([
    {
      id: ORDER_ID,
      buyerEmail: 'maya@example.com',
      placedAt: '2026-01-03T00:00:00Z',
      total: 50,
      status,
      trackingNumber: status === 'SHIPPED' ? 'AZ123' : null,
      lines: [
        {
          id: 'l1',
          productTitle: 'Backpack',
          variantLabel: 'Blue',
          quantity: 2,
          unitPrice: 25,
          lineTotal: 50,
        },
      ],
    },
  ])
}

describe('SellerOrderPanel', () => {
  beforeEach(() => resetSellerOrders())

  it('shows the fulfilment log, items and totals', async () => {
    seed()
    renderPanel()

    expect(await screen.findByText('Fulfilment log')).toBeInTheDocument()
    expect(screen.getByText('Backpack')).toBeInTheDocument()
    expect(screen.getByText('maya@example.com')).toBeInTheDocument()
    expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0)
  })

  it('offers only the stages the seller owns', async () => {
    seed()
    renderPanel()
    await screen.findByText('Add an update')

    expect(screen.getByRole('button', { name: 'Packed' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Handed over' })).toBeEnabled()
    // Transit and delivery come from the carrier, so they are not offered.
    expect(screen.queryByRole('button', { name: /In transit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delivered/i })).not.toBeInTheDocument()
  })

  it('marks an order packed with a parcel count', async () => {
    seed()
    renderPanel()
    await screen.findByText('Add an update')

    await userEvent.clear(screen.getByLabelText('Parcels'))
    await userEvent.type(screen.getByLabelText('Parcels'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Mark as packed' }))

    // Once packed, that stage is no longer on offer - the order has moved on.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Packed' })).toBeDisabled(),
    )
  })

  it('will not offer packing again once the order has moved on', async () => {
    seed('SHIPPED')
    renderPanel()
    await screen.findByText('Fulfilment log')

    // Nothing left for the seller to do, so the compose box is gone entirely.
    expect(screen.queryByText('Add an update')).not.toBeInTheDocument()
  })

  it('surfaces a failure to load rather than an empty panel', async () => {
    renderPanel('does-not-exist')
    expect(await screen.findByText("Couldn't load this order")).toBeInTheDocument()
  })
})
