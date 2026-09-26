import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'

import { SellerRefunds } from './SellerRefunds'

function renderPage(initialEntry = '/seller/refunds') {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SellerRefunds />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** A real history, so a test can press Back the way a browser does. */
function renderWithHistory(entries: string[]) {
  const router = createMemoryRouter([{ path: '/seller/refunds', Component: SellerRefunds }], {
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

  it('clamps a negative page param to the first page', async () => {
    renderPage('/seller/refunds?page=-2')

    // A negative offset used to reach the request, which answered with nothing.
    expect(await screen.findByText('ref_4d90b12c')).toBeInTheDocument()
  })

  it('puts the search box back in step with the URL when you navigate back', async () => {
    const router = renderWithHistory(['/seller/refunds', '/seller/refunds?q=tanaka'])

    const search = await screen.findByLabelText('Search refund requests')
    expect(search).toHaveValue('tanaka')
    await screen.findByText('ref_77a1e604')

    await act(async () => {
      await router.navigate(-1)
    })

    // The box used to keep the old term after the URL dropped it, so it read as
    // a filtered list with the whole queue back on screen.
    await waitFor(() => expect(search).toHaveValue(''))
    expect(await screen.findByText('ref_4d90b12c')).toBeInTheDocument()
  })

  it('leaves one history entry behind a typed search, and its own for a tab', async () => {
    const router = renderWithHistory(['/seller/refunds'])
    await screen.findByText('ref_4d90b12c')

    await userEvent.type(screen.getByLabelText('Search refund requests'), 'tanaka')
    await waitFor(() => expect(router.state.location.search).toBe('?q=tanaka'))
    expect(await screen.findByText('ref_77a1e604')).toBeInTheDocument()

    // Every keystroke used to push, so escaping a six-letter search took six
    // Backs. One now lands on the queue as it was before the typing started.
    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('ref_4d90b12c')).toBeInTheDocument()

    // A tab is a navigation, so it still leaves an entry to Back out of.
    await userEvent.click(screen.getByRole('tab', { name: 'Awaiting return' }))
    await waitFor(() => expect(router.state.location.search).toBe('?status=AWAITING_RETURN'))

    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('ref_4d90b12c')).toBeInTheDocument()
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

    // The drawer stays open on the request that was just acted on. It used to
    // be derived from the current page, so it closed on the seller the instant
    // their decision succeeded.
    const settled = await screen.findByRole('dialog')
    // Once as the status badge, once as the completed step in the stepper.
    expect(await within(settled).findAllByText('Approved')).toHaveLength(2)

    // Close it, and the approved request has left the "needs a decision" queue.
    // Asserted after closing because the drawer is modal - Radix marks the rest
    // of the page aria-hidden, so the table is not in the accessibility tree
    // while it is open.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('ref_4d90b12c')).not.toBeInTheDocument())
  })

  it('refuses an approval for more than was requested', async () => {
    renderPage()
    await screen.findByText('ref_4d90b12c')

    const [firstRow] = screen.getAllByRole('row').slice(1)
    await userEvent.click(within(firstRow).getByRole('button', { name: 'Review' }))

    const drawer = await screen.findByRole('dialog')
    await userEvent.type(await within(drawer).findByLabelText('Refund amount'), '9999')

    expect(
      within(drawer).getByText('Enter an amount above zero and no more than what was requested.'),
    ).toBeInTheDocument()
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
