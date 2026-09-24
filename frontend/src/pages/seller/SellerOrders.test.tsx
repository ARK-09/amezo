import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetSellerOrders } from '@/test/msw/fixtures/sellerOrders'

import { SellerOrders } from './SellerOrders'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/seller/orders']}>
        <Routes>
          <Route path="/seller/orders" element={<SellerOrders />} />
          <Route path="/seller/orders/:orderId" element={<div>Order detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const baseOrder = {
  buyerEmail: 'buyer@example.com',
  placedAt: '2026-01-01T00:00:00Z',
  trackingNumber: null,
  shippedAt: null,
  lines: [{ id: 'l1', productTitle: 'Backpack', variantLabel: 'Blue', quantity: 2, unitPrice: 25 }],
}

describe('SellerOrders', () => {
  beforeEach(() => resetSellerOrders())

  it('shows the empty state with no orders', async () => {
    renderPage()
    expect(await screen.findByText('No orders yet')).toBeInTheDocument()
  })

  it('lists orders with their computed total', async () => {
    resetSellerOrders([{ ...baseOrder, id: 'o1', status: 'PLACED', total: 0 }])

    renderPage()

    expect(await screen.findByText('buyer@example.com')).toBeInTheDocument()
    expect(screen.getByText('$50.00')).toBeInTheDocument()
    expect(screen.getByText('PLACED')).toBeInTheDocument()
  })

  it('filters by status', async () => {
    resetSellerOrders([
      { ...baseOrder, id: 'o1', status: 'PLACED', total: 0 },
      { ...baseOrder, id: 'o2', status: 'SHIPPED', total: 0, buyerEmail: 'shipped@example.com' },
    ])

    renderPage()
    await screen.findByText('buyer@example.com')

    await userEvent.click(screen.getByLabelText('Filter by status'))
    await userEvent.click(screen.getByRole('option', { name: 'Shipped' }))

    await waitFor(() => expect(screen.queryByText('buyer@example.com')).not.toBeInTheDocument())
    expect(screen.getByText('shipped@example.com')).toBeInTheDocument()
  })

  it('navigates to the order detail page on row click', async () => {
    resetSellerOrders([{ ...baseOrder, id: 'o1', status: 'PLACED', total: 0 }])

    renderPage()
    await userEvent.click(await screen.findByText('buyer@example.com'))

    expect(await screen.findByText('Order detail page')).toBeInTheDocument()
  })
})
