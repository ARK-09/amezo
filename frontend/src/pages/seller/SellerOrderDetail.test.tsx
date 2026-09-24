import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetSellerOrders } from '@/test/msw/fixtures/sellerOrders'

import { SellerOrderDetail } from './SellerOrderDetail'

function renderPage(orderId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/seller/orders/${orderId}`]}>
        <Routes>
          <Route path="/seller/orders/:orderId" element={<SellerOrderDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SellerOrderDetail', () => {
  beforeEach(() => {
    resetSellerOrders([
      {
        id: 'o1',
        buyerEmail: 'buyer@example.com',
        placedAt: '2026-01-01T00:00:00Z',
        status: 'PLACED',
        total: 0,
        trackingNumber: null,
        shippedAt: null,
        lines: [{ id: 'l1', productTitle: 'Trail Backpack', variantLabel: 'Blue / M', quantity: 2, unitPrice: 25 }],
      },
    ])
  })

  it('shows the line items and total', async () => {
    renderPage('o1')

    expect(await screen.findByText('Trail Backpack')).toBeInTheDocument()
    expect(screen.getByText('Blue / M')).toBeInTheDocument()
    expect(screen.getByText('Total: $50.00')).toBeInTheDocument()
  })

  it('marks the order as shipped with a tracking number', async () => {
    renderPage('o1')
    await screen.findByText('Trail Backpack')

    await userEvent.type(screen.getByLabelText('Tracking number'), 'TRACK123')
    await userEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))

    expect(await screen.findByText('Tracking: TRACK123')).toBeInTheDocument()
    expect(screen.getByText('SHIPPED')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tracking number')).not.toBeInTheDocument()
  })

  it('does not show the ship form for an already-shipped order', async () => {
    resetSellerOrders([
      {
        id: 'o2',
        buyerEmail: 'buyer2@example.com',
        placedAt: '2026-01-01T00:00:00Z',
        status: 'SHIPPED',
        total: 0,
        trackingNumber: 'OLDTRACK',
        shippedAt: '2026-01-02T00:00:00Z',
        lines: [{ id: 'l2', productTitle: 'Backpack', variantLabel: 'Red', quantity: 1, unitPrice: 10 }],
      },
    ])

    renderPage('o2')

    expect(await screen.findByText('Tracking: OLDTRACK')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tracking number')).not.toBeInTheDocument()
  })
})
