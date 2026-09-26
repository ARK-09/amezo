import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { server } from '@/test/msw/server'

import { MyOrders } from './MyOrders'

function renderPage(initialEntry = '/orders') {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MyOrders />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const HEADPHONES = 'Wireless Noise-Cancelling Headphones'
const LAPTOP = '14" Ultrabook Laptop, 16GB RAM'

describe('MyOrders', () => {
  it('lists the buyer’s orders with their delivery state', async () => {
    renderPage()

    expect(await screen.findByText('ord_19ff4c82')).toBeInTheDocument()
    expect(screen.getByText(HEADPHONES)).toBeInTheDocument()
    expect(screen.getByText(/Delivered 16 Sep 2026/)).toBeInTheDocument()
    expect(screen.getByText('2 orders')).toBeInTheDocument()
  })

  it('loads the full order only when a card is expanded', async () => {
    renderPage()
    await screen.findByText('ord_19ff4c82')

    // The summary carries no totals breakdown - that arrives with the detail.
    expect(screen.queryByText('Shipped to')).not.toBeInTheDocument()

    const [firstCard] = screen.getAllByRole('article')
    await userEvent.click(within(firstCard).getByRole('button', { name: /Order details/ }))

    expect(await within(firstCard).findByText('Shipped to')).toBeInTheDocument()
    expect(within(firstCard).getByText('118 Ferndale Road', { exact: false })).toBeInTheDocument()
    // once in the card header, once in the totals block
    expect(within(firstCard).getAllByText('$143.40')).toHaveLength(2)
  })

  it('shows an open refund request inside the expanded order', async () => {
    renderPage()
    await screen.findByText('ord_19ff4c82')

    const [firstCard] = screen.getAllByRole('article')
    await userEvent.click(within(firstCard).getByRole('button', { name: /Order details/ }))

    expect(await within(firstCard).findByText('Return in progress')).toBeInTheDocument()
    expect(within(firstCard).getByText('ref_90ce34aa')).toBeInTheDocument()
    expect(within(firstCard).getByText(/Send the item back/)).toBeInTheDocument()
  })

  it('offers a refund only on a delivered order with none already open', async () => {
    renderPage()
    await screen.findByText(LAPTOP)

    const cards = screen.getAllByRole('article')
    const delivered = cards.find((card) => within(card).queryByText(LAPTOP))!
    const inTransit = cards.find((card) => within(card).queryByText(HEADPHONES))!

    expect(within(delivered).getByRole('link', { name: 'Return or refund' })).toHaveAttribute(
      'href',
      '/orders/order-2222/refund',
    )
    expect(within(inTransit).queryByRole('link', { name: 'Return or refund' })).not.toBeInTheDocument()
  })

  it('filters to delivered orders from the tabs', async () => {
    renderPage()
    await screen.findByText(HEADPHONES)

    await userEvent.click(screen.getByRole('button', { name: 'Delivered' }))

    expect(await screen.findByText(LAPTOP)).toBeInTheDocument()
    expect(screen.queryByText(HEADPHONES)).not.toBeInTheDocument()
  })

  it('surfaces a failure with a retry rather than an empty list', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/orders', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Internal error', status: 500 },
          { status: 500 },
        ),
      ),
    )
    renderPage()

    expect(await screen.findByText("Couldn't load your orders", {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
