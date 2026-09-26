import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'

import { SellerRefunds } from './SellerRefunds'

function renderPage() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={['/seller/refunds']}>
        <SellerRefunds />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SellerRefunds', () => {
  it('opens on the requests that need a decision', async () => {
    renderPage()

    expect(await screen.findByText('ref_4d90b12c')).toBeInTheDocument()
    expect(screen.getByText('ref_77a1e604')).toBeInTheDocument()
    // Already approved and already declined are on other tabs.
    expect(screen.queryByText('ref_90ce34aa')).not.toBeInTheDocument()
    expect(screen.queryByText('ref_15b7d420')).not.toBeInTheDocument()
  })

  it('switches tab to the requests awaiting a return', async () => {
    renderPage()
    await screen.findByText('ref_4d90b12c')

    await userEvent.click(screen.getByRole('tab', { name: 'Awaiting return' }))

    expect(await screen.findByText('ref_90ce34aa')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('ref_4d90b12c')).not.toBeInTheDocument())
  })

  it('searches across buyer, order and product', async () => {
    renderPage()
    await screen.findByText('ref_4d90b12c')

    await userEvent.type(screen.getByLabelText('Search refund requests'), 'tanaka')

    expect(await screen.findByText('ref_77a1e604')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('ref_4d90b12c')).not.toBeInTheDocument())
  })

  it('approves a request from the drawer and moves it off the queue', async () => {
    renderPage()
    await screen.findByText('ref_4d90b12c')

    const [firstRow] = screen.getAllByRole('row').slice(1)
    await userEvent.click(within(firstRow).getByRole('button', { name: 'Review' }))

    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('Jonas Lindqvist')).toBeInTheDocument()
    await userEvent.click(
      within(drawer).getByRole('button', { name: 'Approve and request return' }),
    )

    // The queue is "needs a decision", so an approved request leaves it.
    await waitFor(() => expect(screen.queryByText('ref_4d90b12c')).not.toBeInTheDocument())
  })

  it('refuses an approval for more than was requested', async () => {
    renderPage()
    await screen.findByText('ref_4d90b12c')

    const [firstRow] = screen.getAllByRole('row').slice(1)
    await userEvent.click(within(firstRow).getByRole('button', { name: 'Review' }))

    const drawer = await screen.findByRole('dialog')
    await userEvent.type(await within(drawer).findByLabelText('Refund amount'), '9999')

    expect(within(drawer).getByText('Cannot be more than the requested amount.')).toBeInTheDocument()
    expect(
      within(drawer).getByRole('button', { name: 'Approve and request return' }),
    ).toBeDisabled()
  })

  it('links the drawer to the same panel full page', async () => {
    renderPage()
    await screen.findByText('ref_4d90b12c')

    const [firstRow] = screen.getAllByRole('row').slice(1)
    await userEvent.click(within(firstRow).getByRole('button', { name: 'Review' }))

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByRole('link', { name: /Full page/ })).toHaveAttribute(
      'href',
      '/seller/refunds/ref-1',
    )
  })
})
