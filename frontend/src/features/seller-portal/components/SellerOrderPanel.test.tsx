import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
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
    // Delivered is offered but not yet reachable: nothing that has only been
    // placed has arrived. It is a stand-in for carrier reporting, which is why
    // the seller has it at all.
    expect(screen.getByRole('button', { name: 'Delivered' })).toBeDisabled()
    // Transit is still the carrier's, and nothing here can report it.
    expect(screen.queryByRole('button', { name: /In transit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Out for delivery/i })).not.toBeInTheDocument()
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

  // Number('') is 0 and Number('abc') is NaN, so the old clamp posted "1 parcel"
  // whatever the seller had left in the box.
  it('will not post a parcel count the seller did not type', async () => {
    seed()
    renderPanel()
    await screen.findByText('Add an update')

    await userEvent.clear(screen.getByLabelText('Parcels'))

    const post = screen.getByRole('button', { name: 'Mark as packed' })
    expect(post).toBeDisabled()
    expect(screen.getByText('How many parcels? Enter at least 1.')).toBeInTheDocument()
    expect(screen.getByLabelText('Parcels')).toHaveAttribute('aria-invalid', 'true')

    await userEvent.type(screen.getByLabelText('Parcels'), 'two')
    expect(post).toBeDisabled()

    await userEvent.clear(screen.getByLabelText('Parcels'))
    await userEvent.type(screen.getByLabelText('Parcels'), '2')
    expect(post).toBeEnabled()
  })

  it('will not offer packing again once the order has moved on', async () => {
    seed('SHIPPED')
    renderPanel()
    await screen.findByText('Add an update')

    expect(screen.getByRole('button', { name: 'Packed' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Handed over' })).toBeDisabled()
    // The one move left, and the reason the compose box is still here at all.
    expect(screen.getByRole('button', { name: 'Delivered' })).toBeEnabled()
  })

  it('records the delivery when the seller marks it', async () => {
    seed('SHIPPED')
    renderPanel()
    await screen.findByText('Add an update')

    await userEvent.click(screen.getByRole('button', { name: 'Mark as delivered' }))

    // Delivered is the end of what a seller can do, so the compose box goes.
    await waitFor(() => expect(screen.queryByText('Add an update')).not.toBeInTheDocument())
    // And the log dates the step from what was recorded, rather than leaving a
    // ticked step with no date beside it. Scoped to the log, because the status
    // badge at the top of the panel now reads "Delivered" too.
    const log = screen.getByText('Fulfilment log').closest('section')
    const delivered = within(log!).getByText('Delivered').closest('li')
    expect(delivered).not.toBeNull()
    expect(within(delivered!).queryByText('Not yet')).not.toBeInTheDocument()
  })

  it('offers nothing once the order is delivered', async () => {
    seed('DELIVERED')
    renderPanel()
    await screen.findByText('Fulfilment log')

    expect(screen.queryByText('Add an update')).not.toBeInTheDocument()
  })

  it('surfaces a failure to load rather than an empty panel', async () => {
    renderPanel('does-not-exist')
    expect(await screen.findByText("Couldn't load this order")).toBeInTheDocument()
  })
})
