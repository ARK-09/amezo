import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'

import { RefundRequest } from './RefundRequest'

// order-2222 is the delivered one with canRequestRefund true.
function renderPage(orderId = 'order-2222') {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={[`/orders/${orderId}/refund`]}>
        <Routes>
          <Route path="/orders/:orderId/refund" element={<RefundRequest />} />
          <Route path="/orders" element={<p>Orders list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const LAPTOP = '14" Ultrabook Laptop, 16GB RAM'
const DETAIL = 'The screen developed a dead pixel column about a week after it arrived.'

describe('RefundRequest', () => {
  it('will not submit until an item and enough detail are given', async () => {
    renderPage()
    await screen.findByText(LAPTOP)

    const submit = screen.getByRole('button', { name: 'Send request' })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/pick at least one item and add a little more detail/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: LAPTOP }))
    expect(submit).toBeDisabled()
    expect(screen.getByText(/Still need to add a little more detail/)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('What went wrong'), DETAIL)
    expect(submit).toBeEnabled()
  })

  it('totals only the selected lines', async () => {
    renderPage()
    await screen.findByText(LAPTOP)

    expect(screen.getByText('Nothing selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: LAPTOP }))
    expect(screen.getByText('1 of 1 items · $899.00')).toBeInTheDocument()
  })

  it('asks where the money goes only for a refund, not a replacement', async () => {
    renderPage()
    await screen.findByText(LAPTOP)

    expect(screen.getByText('Where the money goes', { exact: false })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: /Replacement/ }))
    expect(screen.queryByText('Where the money goes', { exact: false })).not.toBeInTheDocument()
  })

  it('confirms the request and what happens next once sent', async () => {
    renderPage()
    await screen.findByText(LAPTOP)

    await userEvent.click(screen.getByRole('checkbox', { name: LAPTOP }))
    await userEvent.type(screen.getByLabelText('What went wrong'), DETAIL)
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByText('Request sent to Vexel')).toBeInTheDocument()
    expect(screen.getByText(/You asked for \$899\.00 back on 1 × /)).toBeInTheDocument()
    expect(screen.getByText('Seller reviews it')).toBeInTheDocument()
  })

  // The eligibility guard used to run before the confirmation. Submitting
  // invalidates the order, which comes back ineligible, so the success screen
  // was replaced by a redirect the instant the request went through.
  it('keeps the confirmation on screen after the order stops being eligible', async () => {
    renderPage()
    await screen.findByText(LAPTOP)

    await userEvent.click(screen.getByRole('checkbox', { name: LAPTOP }))
    await userEvent.type(screen.getByLabelText('What went wrong'), DETAIL)
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByText('Request sent to Vexel')).toBeInTheDocument()
    // Still there once the invalidated order has refetched as ineligible.
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(screen.getByText('Request sent to Vexel')).toBeInTheDocument()
    expect(screen.queryByText('Orders list')).not.toBeInTheDocument()
  })

  it('sends a buyer away from an order that cannot be refunded', async () => {
    // order-1111 already has an open request, so canRequestRefund is false.
    renderPage('order-1111')
    expect(await screen.findByText('Orders list')).toBeInTheDocument()
  })
})
