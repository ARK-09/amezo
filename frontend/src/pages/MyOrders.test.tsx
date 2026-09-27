import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { listBuyerOrders } from '@/test/msw/fixtures/buyerOrders'
import { signInBuyerSession } from '@/test/msw/fixtures/sellerAuth'
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

/**
 * The counts endpoint answers 401 without one, so a test that wants numbers on
 * the tabs has to arrive signed in - exactly as the real page does.
 */
function signIn() {
  signInBuyerSession({ buyerIdentityId: 'buyer-1111', email: 'rhea@example.com' })
}

/** The numbered buttons, away from the tabs and the cards. */
function pager() {
  return within(screen.getByRole('navigation', { name: 'pagination' }))
}

/**
 * One card, found by the order reference printed in its header. The list is newest
 * first, so reaching for `getAllByRole('article')[0]` names a different order every
 * time the seed gains one.
 */
async function card(reference: string) {
  const heading = await screen.findByText(reference)
  return within(heading.closest('article')!)
}

const HEADPHONES = 'Wireless Noise-Cancelling Headphones'
const LAPTOP = '14" Ultrabook Laptop, 16GB RAM'
const IN_TRANSIT = 'ord_19ff4c82'
const DELIVERED = 'ord_c41d9a70'
const CANCELLED = 'ord_af6218d3'
const TWO_LINES = 'ord_e0417cc6'

describe('MyOrders', () => {
  // Every buyer route needs a session, the orders list included - the fixture
  // used to serve it to anyone, which let these tests pass against behaviour the
  // real API does not have.
  beforeEach(signIn)

  it('lists the buyer’s orders with their delivery state', async () => {
    renderPage()

    expect(await screen.findByText(IN_TRANSIT)).toBeInTheDocument()
    expect(screen.getByText(HEADPHONES)).toBeInTheDocument()
    expect(screen.getByText(/Delivered 16 Sep 2026/)).toBeInTheDocument()
    // Newest first, as the endpoint promises.
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(screen.getByText('5 orders in past 12 months')).toBeInTheDocument()
  })

  it('heads the page with the whole history, not this view', async () => {
    renderPage()

    // Six on file including the 2025 one the twelve-month window leaves out, and
    // one refund still running - the seeded return awaiting its parcel.
    expect(await screen.findByText('6 orders on file · 1 refund in progress')).toBeInTheDocument()
  })

  it('names each delivery state the way the design does', async () => {
    renderPage()

    expect(await (await card(CANCELLED)).findByText('Order cancelled')).toBeInTheDocument()
    expect((await card(DELIVERED)).getByText('Delivered 16 Sep 2026')).toBeInTheDocument()
    expect(
      (await card(IN_TRANSIT)).getByText('Arriving Monday 28 September'),
    ).toBeInTheDocument()
  })

  it('prints the unit price and the hidden-item count on a preview line', async () => {
    renderPage()

    const twoLines = await card(TWO_LINES)
    // "Slate · Qty 1 · $189.00" - the unit price used to be dropped entirely.
    expect(twoLines.getByText('Slate · Qty 1 · $189.00')).toBeInTheDocument()
    expect(twoLines.getByText('Brushed · Qty 2 · $32.00')).toBeInTheDocument()
    // Three units across two lines, both previewed, so nothing is hidden - but
    // the second line's pair is what the count has to get right.
    expect(twoLines.queryByText(/more$/)).not.toBeInTheDocument()
  })

  it('counts what the preview left out', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/orders', () =>
        HttpResponse.json({
          content: [
            {
              id: 'order-big',
              reference: 'ord_big',
              placedAt: '2026-09-01T00:00:00Z',
              status: 'DELIVERED',
              total: 100,
              currency: 'USD',
              // Five units, two of them on the one previewed line.
              itemCount: 5,
              seller: { id: 'seller-1', name: 'Aurora Audio', handle: 'aurora-audio' },
              previewLines: [
                {
                  id: 'line-big-a',
                  productRef: 'trail-running-shoes',
                  productTitle: 'Trail Running Shoes',
                  variantLabel: 'UK 9',
                  quantity: 2,
                  unitPrice: 119,
                  lineTotal: 238,
                },
              ],
              shipment: { deliveredAt: '2026-09-04T00:00:00Z' },
            },
          ],
          page: 0,
          totalElements: 1,
          totalPages: 1,
        }),
      ),
    )
    renderPage()

    // "+3 more", not "+4": the count is units, so the previewed pair counts twice.
    expect(await screen.findByText('+3 more')).toBeInTheDocument()
  })

  it('loads the full order only when a card is expanded', async () => {
    renderPage()
    const inTransit = await card(IN_TRANSIT)

    // The summary carries no totals breakdown - that arrives with the detail.
    expect(screen.queryByText('Shipped to')).not.toBeInTheDocument()

    await userEvent.click(inTransit.getByRole('button', { name: /Order details/ }))

    expect(await inTransit.findByText('Shipped to')).toBeInTheDocument()
    expect(inTransit.getByText('118 Ferndale Road', { exact: false })).toBeInTheDocument()
    // once in the card header, once in the totals block
    expect(inTransit.getAllByText('$143.40')).toHaveLength(2)
  })

  it('shows an open refund request inside the expanded order', async () => {
    renderPage()
    const inTransit = await card(IN_TRANSIT)

    await userEvent.click(inTransit.getByRole('button', { name: /Order details/ }))

    // The card's badge and the panel's heading both read the real status. The
    // badge used to be hardcoded to "Refund requested", so a card could
    // contradict the panel sitting directly underneath it.
    expect(inTransit.getByText('Return this item')).toBeInTheDocument()
    expect(
      await inTransit.findByText('Refund approved — send the item back'),
    ).toBeInTheDocument()
    expect(inTransit.getByText('ref_90ce34aa')).toBeInTheDocument()
    // The label number is on the request, and the sentence names it.
    expect(inTransit.getByText(/using label AZ-RET-88412/)).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: /^Delivered/ }))

    expect(await screen.findByText(LAPTOP)).toBeInTheDocument()
    expect(screen.queryByText(HEADPHONES)).not.toBeInTheDocument()
  })

  it('carries a count on every tab', async () => {
    signIn()
    renderPage()

    // Five in the twelve-month window: two moving, two delivered, one cancelled.
    // Every bucket is counted, so the same order shows up under more than one tab.
    expect(await screen.findByRole('button', { name: 'All orders 5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'In progress 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delivered 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refunds & returns 1' })).toBeInTheDocument()
  })

  it('narrows the counts and the list to the chosen date window', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'All orders 5' })

    // The 2025 order is outside the twelve months the page opens on.
    expect(screen.queryByText('ord_66de1a09')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Filter by date'))
    await userEvent.click(await screen.findByRole('option', { name: '2025' }))

    expect(await screen.findByText('ord_66de1a09')).toBeInTheDocument()
    expect(screen.queryByText(IN_TRANSIT)).not.toBeInTheDocument()
    // Both the count strip and the result line follow the window.
    expect(await screen.findByRole('button', { name: 'All orders 1' })).toBeInTheDocument()
    expect(screen.getByText('1 order in 2025')).toBeInTheDocument()
  })

  it('offers exactly the four windows the design lists', async () => {
    renderPage()
    await screen.findByText(IN_TRANSIT)

    await userEvent.click(screen.getByLabelText('Filter by date'))
    const year = new Date().getFullYear()
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Past 3 months',
      'Past 12 months',
      String(year),
      String(year - 1),
    ])
  })

  it('counts the matches against the term that found them', async () => {
    renderPage('/orders?q=ultrabook')

    expect(await screen.findByText('1 order matches “ultrabook”')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Search your orders'))
    await userEvent.type(screen.getByLabelText('Search your orders'), 'aurora')

    expect(await screen.findByText('0 orders match “aurora”')).toBeInTheDocument()
  })

  it('leaves the counts alone when a tab is chosen', async () => {
    signIn()
    const asked: string[] = []
    server.use(
      http.get('http://localhost:8080/api/v1/orders/facets', ({ request }) => {
        asked.push(new URL(request.url).search)
        return undefined // fall through to the real handler
      }),
    )
    renderPage()
    await screen.findByRole('button', { name: 'All orders 5' })

    await userEvent.click(screen.getByRole('button', { name: 'Delivered 2' }))
    expect(await screen.findByText(LAPTOP)).toBeInTheDocument()
    expect(screen.queryByText(HEADPHONES)).not.toBeInTheDocument()

    // The strip describes every bucket, not the one being viewed: the list is
    // down to the delivered orders and the other three counts still stand.
    expect(screen.getByRole('button', { name: 'All orders 5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'In progress 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refunds & returns 1' })).toBeInTheDocument()
    // And no second request for the tab: the group is not part of what was asked.
    // Two questions are asked of this endpoint - the window the tabs describe,
    // and the unfiltered history the header line counts - and neither is a tab.
    // Asserted on shape rather than the literal query: the window is now real
    // dates computed from today, so pinning "?from=2025-09-27" would pass today
    // and fail tomorrow.
    expect(new Set(asked).size).toBe(2)
    expect(asked.some((search) => search.includes('group'))).toBe(false)
    // One windowed question (the tabs) and one unwindowed (the header's "on file").
    expect(asked.filter((search) => search.includes('from=')).length).toBeGreaterThan(0)
    expect(asked).toContain('')
  })

  it('starts from the first page again when a tab changes', async () => {
    seedManyOrders(8)
    const router = renderWithHistory(['/orders?size=5&page=1'])
    await screen.findByText('ord_paged_6')

    await userEvent.click(screen.getByRole('button', { name: /^Delivered/ }))

    // Page 2 of one bucket means nothing in the next: a tab resets ?page= like
    // every other filter, and pushes so Back undoes it.
    await waitFor(() => expect(router.state.location.search).toBe('?size=5&group=delivered'))
    expect(await screen.findByText('ord_paged_1')).toBeInTheDocument()
    expect(screen.getByText('Showing 1\u20135 of 8 orders')).toBeInTheDocument()
  })

  it('still lists the orders when the counts fail', async () => {
    signIn()
    server.use(
      http.get('http://localhost:8080/api/v1/orders/facets', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Internal error', status: 500 },
          { status: 500 },
        ),
      ),
    )
    renderPage()

    // A tab short of its badge still filters; a page that waited on the counts
    // would show nothing at all because of a number.
    expect(await screen.findByText(HEADPHONES)).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your orders")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Delivered/ }))
    expect(await screen.findByText(LAPTOP)).toBeInTheDocument()
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

  // The seller lists offer a Per page select; the buyer's My Orders is designed
  // without one, so the only page size is whatever ?size= carries.
  it('offers no page size, and shows no pager on a single page', async () => {
    renderPage()
    await screen.findByText(IN_TRANSIT)

    // Five orders at the default ten a page: one page, nothing to page through.
    expect(screen.queryByRole('navigation', { name: 'pagination' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument()
    expect(screen.queryByText('Per page')).not.toBeInTheDocument()
  })

  it('keeps the range label on the pager it does show', async () => {
    seedManyOrders(8)
    renderPage('/orders?size=5')

    expect(await screen.findByText('Showing 1\u20135 of 8 orders')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument()
  })

  it('goes back to the first page when the date window changes', async () => {
    seedManyOrders(8)
    const router = renderWithHistory(['/orders?size=5&page=1'])
    await screen.findByText('ord_paged_6')

    await userEvent.click(screen.getByLabelText('Filter by date'))
    await userEvent.click(await screen.findByRole('option', { name: 'Past 3 months' }))

    // Page 2 of one window means nothing in another, so ?page= goes with it.
    await waitFor(() => expect(router.state.location.search).toBe('?size=5&period=3m'))
    expect(await screen.findByText('ord_paged_1')).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: /^Delivered/ }))
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

  /**
   * What the real backend serves today: no refund model yet, so every refund field
   * is null, and no shipment or payment is recorded at all. The card has to read as
   * a finished card rather than one with the furniture of absent data in it.
   */
  describe('against an order with nothing optional on it', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:8080/api/v1/orders', () =>
          HttpResponse.json({
            content: [
              {
                id: 'order-bare',
                reference: 'ord_bare',
                placedAt: '2026-09-10T00:00:00Z',
                status: 'DELIVERED',
                total: 119,
                currency: 'USD',
                itemCount: 1,
                seller: { id: 'seller-1', name: 'Aurora Audio', handle: 'aurora-audio' },
                previewLines: [
                  {
                    id: 'line-bare',
                    productRef: 'trail-running-shoes',
                    productTitle: 'Trail Running Shoes',
                    variantLabel: 'UK 9',
                    quantity: 1,
                    unitPrice: 119,
                    lineTotal: 119,
                    refundRequestId: null,
                    refundStatus: null,
                  },
                ],
                shipment: null,
                openRefundRequestId: null,
                openRefundStatus: null,
              },
            ],
            page: 0,
            totalElements: 1,
            totalPages: 1,
          }),
        ),
      )
    })

    it('draws no refund badge, no tracking and no blank delivery line', async () => {
      renderPage()

      const bare = await card('ord_bare')
      // No deliveredAt, so the headline is the state without a date rather than
      // "Delivered —", and the subline names the seller rather than a blank carrier.
      expect(bare.getByText('Delivered')).toBeInTheDocument()
      expect(bare.getByText('Sold by Aurora Audio')).toBeInTheDocument()
      expect(bare.queryByRole('button', { name: 'Track package' })).not.toBeInTheDocument()
      expect(bare.queryByRole('link', { name: 'Track package' })).not.toBeInTheDocument()
      // No badge, because there is no refund - only the action that offers one.
      expect(
        bare.queryByText(/Refund under review|Return this item|Refunded|Replacement sent/),
      ).not.toBeInTheDocument()
      // Still delivered, so the two actions that do apply are both there.
      expect(bare.getByRole('button', { name: /Write a review/ })).toBeInTheDocument()
      expect(bare.getByRole('link', { name: 'Return or refund' })).toBeInTheDocument()
    })
  })

  it('writes the header line without the refund half when no refund count can be had', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/refund-requests', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Not implemented', status: 501 },
          { status: 501 },
        ),
      ),
    )
    renderPage()

    // Not a skeleton that never resolves, and not an invented "no open refunds".
    expect(await screen.findByText('6 orders on file')).toBeInTheDocument()
  })

  it('drops every filter from the empty state rather than sending you shopping', async () => {
    const router = renderWithHistory(['/orders?group=delivered&period=2025&q=nothing-matches-this'])

    expect(await screen.findByText('No orders here')).toBeInTheDocument()
    expect(
      screen.getByText('Nothing matches “nothing-matches-this” in this date range.'),
    ).toBeInTheDocument()
    // "Start shopping" left the page; what is empty here is a filtered view.
    expect(screen.queryByRole('link', { name: 'Start shopping' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show all orders' }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(await screen.findByText(IN_TRANSIT)).toBeInTheDocument()
    expect(screen.getByLabelText('Search your orders')).toHaveValue('')
    expect(screen.getByLabelText('Filter by date')).toHaveTextContent('Past 12 months')
  })

  it('tells the empty state apart from an empty filter with no search term', async () => {
    renderPage('/orders?group=refunds&period=2025')

    expect(await screen.findByText('No orders here')).toBeInTheDocument()
    expect(screen.getByText('Try a different filter or date range.')).toBeInTheDocument()
  })

  describe('the review button', () => {
    it('reads as one item or several, and names a review once one exists', async () => {
      renderPage()

      // Nothing reviewed: one line asks for a review, two ask for reviews.
      expect(
        (await card(DELIVERED)).getByRole('button', { name: /Write a review/ }),
      ).toBeInTheDocument()
      expect(
        (await card(TWO_LINES)).getByRole('button', { name: /Review these items/ }),
      ).toBeInTheDocument()
    })

    it('says so once every product on the card has been reviewed', async () => {
      // The eligibility answer is what tells a reviewed product from one still
      // waiting, and it is per product - so this is the state the card reads.
      server.use(
        http.get('http://localhost:8080/products/:productRef/reviews/eligibility', ({ params }) =>
          HttpResponse.json({
            eligible: false,
            reason: 'ALREADY_REVIEWED',
            orderLineId: null,
            existingReview: {
              id: `review-${params.productRef}`,
              productId: 'p1',
              rating: 5,
              body: 'Good.',
              createdAt: '2026-09-20T09:00:00Z',
              authorName: 'Rhea',
            },
          }),
        ),
      )
      renderPage()

      // The label starts at the unreviewed one and upgrades when the per-product
      // answers land; it never claims a review it has not been told about.
      expect(
        await (await card(DELIVERED)).findByRole('button', { name: /Your review/ }),
      ).toBeInTheDocument()
    })
  })

  describe('Track package', () => {
    it('opens the delivery timeline when the carrier gave no URL', async () => {
      renderPage()
      const inTransit = await card(IN_TRANSIT)

      await userEvent.click(inTransit.getByRole('button', { name: 'Track package' }))

      // The timeline inside the card is the only delivery detail there is.
      expect(await inTransit.findByRole('heading', { name: 'Delivery' })).toBeInTheDocument()
      expect(inTransit.getByText('Shipped')).toBeInTheDocument()
    })

    it('leaves for the carrier when the shipment carries one', async () => {
      server.use(
        http.get('http://localhost:8080/api/v1/orders', () =>
          HttpResponse.json({
            content: [
              {
                id: 'order-tracked',
                reference: 'ord_tracked',
                placedAt: '2026-09-20T00:00:00Z',
                status: 'SHIPPED',
                total: 42,
                currency: 'USD',
                itemCount: 1,
                seller: { id: 'seller-1', name: 'Aurora Audio', handle: 'aurora-audio' },
                previewLines: [],
                shipment: {
                  carrier: 'Amezo Express',
                  trackingNumber: '1Z-1',
                  trackingUrl: 'https://track.example.com/1Z-1',
                  estimatedDeliveryAt: '2026-09-29T00:00:00Z',
                  deliveredAt: null,
                  deliveryNote: null,
                },
              },
            ],
            page: 0,
            totalElements: 1,
            totalPages: 1,
          }),
        ),
      )
      renderPage()

      const track = await screen.findByRole('link', { name: 'Track package' })
      expect(track).toHaveAttribute('href', 'https://track.example.com/1Z-1')
      expect(track).toHaveAttribute('target', '_blank')
    })
  })
})
