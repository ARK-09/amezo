import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { listBuyerOrders } from '@/test/msw/fixtures/buyerOrders'
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

/** A real history, so a test can press Back the way a browser does. */
function renderWithHistory(entries: string[]) {
  const router = createMemoryRouter([{ path: '/orders', Component: MyOrders }], {
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

/**
 * The seed holds two orders, which is too few to page. One of them, copied
 * under its own reference, stands in for a buyer with a long history.
 */
function seedManyOrders(count: number) {
  const [first] = listBuyerOrders()
  const all = Array.from({ length: count }, (_, i) => ({
    ...first,
    id: `ord-${i + 1}`,
    reference: `ord_paged_${i + 1}`,
  }))
  server.use(
    http.get('http://localhost:8080/api/v1/orders', ({ request }) => {
      const params = new URL(request.url).searchParams
      const page = Number(params.get('page') ?? 0)
      const size = Number(params.get('size') ?? 10)
      return HttpResponse.json({
        content: all.slice(page * size, page * size + size),
        page,
        totalElements: all.length,
        totalPages: Math.ceil(all.length / size) || 1,
      })
    }),
  )
}

/** The numbered buttons, away from the tabs and the cards. */
function pager() {
  return within(screen.getByRole('navigation', { name: 'pagination' }))
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

    // The card's badge and the panel's heading both read the real status. The
    // badge used to be hardcoded to "Refund requested", so a card could
    // contradict the panel sitting directly underneath it.
    expect(await within(firstCard).findAllByText('Return in progress')).toHaveLength(2)
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

  it('reads a page param that is not a number as the first page', async () => {
    renderPage('/orders?page=abc')

    // NaN used to reach the request, which answered with nothing at all.
    expect(await screen.findByText('ord_19ff4c82')).toBeInTheDocument()
  })

  it('pages by number, and the range label counts the short last page', async () => {
    seedManyOrders(8)
    renderPage('/orders?size=5')

    expect(await screen.findByText('ord_paged_1')).toBeInTheDocument()
    expect(screen.getByText('Showing 1\u20135 of 8 orders')).toBeInTheDocument()

    await userEvent.click(pager().getByRole('button', { name: '2' }))

    expect(await screen.findByText('ord_paged_6')).toBeInTheDocument()
    expect(screen.queryByText('ord_paged_1')).not.toBeInTheDocument()
    // Three cards on the last page, not five - the label follows the cards.
    expect(screen.getByText('Showing 6\u20138 of 8 orders')).toBeInTheDocument()
    expect(pager().getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
  })

  it('goes back to the first page when the page size changes', async () => {
    seedManyOrders(8)
    const router = renderWithHistory(['/orders?size=5&page=1'])
    await screen.findByText('ord_paged_6')

    await userEvent.click(screen.getByLabelText('Rows per page'))
    await userEvent.click(await screen.findByRole('option', { name: '20' }))

    // Page 2 of a 5-a-page list is nowhere in a 20-a-page one, so ?page= goes
    // with the size - the same reset every other filter does.
    await waitFor(() => expect(router.state.location.search).toBe('?size=20'))
    expect(await screen.findByText('ord_paged_1')).toBeInTheDocument()
    expect(screen.getByText('Showing 1\u20138 of 8 orders')).toBeInTheDocument()
  })

  it('ignores a page size that is not one of the offered ones', async () => {
    const asked: (string | null)[] = []
    seedManyOrders(8)
    server.use(
      http.get('http://localhost:8080/api/v1/orders', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('size'))
        return undefined // fall through to the paged handler above
      }),
    )
    // ?size=10000 asked the server for every order ever placed in one response.
    renderPage('/orders?size=10000')

    await screen.findByText('ord_paged_1')
    await waitFor(() => expect(asked.length).toBeGreaterThan(0))
    expect(asked.every((size) => size === '10')).toBe(true)
  })

  it('puts the search box back in step with the URL when you navigate back', async () => {
    const router = renderWithHistory(['/orders', '/orders?q=ultrabook'])

    const search = await screen.findByLabelText('Search your orders')
    expect(search).toHaveValue('ultrabook')
    await screen.findByText(LAPTOP)

    await act(async () => {
      await router.navigate(-1)
    })

    // The box used to keep the old term after the URL dropped it, so it read as
    // a filtered list with every order back on screen.
    await waitFor(() => expect(search).toHaveValue(''))
    expect(await screen.findByText(HEADPHONES)).toBeInTheDocument()
  })

  it('leaves one history entry behind a typed search term', async () => {
    const router = renderWithHistory(['/orders'])
    await screen.findByText(HEADPHONES)

    await userEvent.type(await screen.findByLabelText('Search your orders'), 'laptop')
    expect(await screen.findByText(LAPTOP)).toBeInTheDocument()

    await act(async () => {
      await router.navigate(-1)
    })

    // Every keystroke used to push its own entry, so Back walked out of
    // "laptop" one letter at a time - six presses to leave the search.
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText(HEADPHONES)).toBeInTheDocument()
  })

  it('keeps a filter change on the history stack', async () => {
    const router = renderWithHistory(['/orders'])
    await screen.findByText(HEADPHONES)

    await userEvent.click(screen.getByRole('button', { name: 'Delivered' }))
    await screen.findByText(LAPTOP)
    expect(router.state.location.search).toBe('?group=delivered')

    await act(async () => {
      await router.navigate(-1)
    })

    // A tab is a real navigation: it still pushes, so Back undoes it.
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText(HEADPHONES)).toBeInTheDocument()
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

  // openRefundRequestId holds the latest request even once it is settled, so a
  // declined refund used to hide "Return or refund" for good - while the order
  // detail's canRequestRefund said the buyer was still entitled to ask.
  it('offers a refund again after an earlier request was declined', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/orders', () =>
        HttpResponse.json({
          content: [
            {
              id: 'order-declined',
              reference: 'ord_declined',
              placedAt: '2026-09-01T00:00:00Z',
              status: 'DELIVERED',
              total: 42,
              currency: 'USD',
              itemCount: 1,
              seller: { id: 'seller-1', name: 'Aurora Audio', handle: 'aurora-audio' },
              openRefundRequestId: 'ref-declined',
              openRefundStatus: 'DECLINED',
              previewLines: [],
            },
          ],
          page: 0,
          totalElements: 1,
          totalPages: 1,
        }),
      ),
    )
    renderPage()

    expect(await screen.findByRole('link', { name: /Return or refund/ })).toBeInTheDocument()
  })
})
