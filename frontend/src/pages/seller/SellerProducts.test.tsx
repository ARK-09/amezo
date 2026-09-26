import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import {
  addSellerProduct,
  resetSellerProductDetails,
  resetSellerProducts,
} from '@/test/msw/fixtures/sellerProducts'
import { server } from '@/test/msw/server'

import { SellerProducts } from './SellerProducts'

function renderPage(initialEntry = '/seller/products') {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SellerProducts />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** A real history, so a test can press Back the way a browser does. */
function renderWithHistory(entries: string[]) {
  const router = createMemoryRouter([{ path: '/seller/products', Component: SellerProducts }], {
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

function seed(overrides: Partial<Parameters<typeof addSellerProduct>[0]> = {}) {
  addSellerProduct({
    id: 'p1',
    slug: 'trail-backpack',
    title: 'Trail Backpack',
    thumbnailUrl: null,
    category: { slug: 'outdoor', name: 'Outdoor' },
    variantCount: 2,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  })
}

/** Newest first, so Item 1 leads the list and Item 8 closes it. */
function seedMany(count: number) {
  for (let i = 1; i <= count; i++) {
    seed({
      id: `p${i}`,
      slug: `item-${i}`,
      title: `Item ${i}`,
      createdAt: `2026-01-${String(count - i + 1).padStart(2, '0')}T00:00:00Z`,
    })
  }
}

/** The numbered buttons, away from the row and filter controls. */
function pager() {
  return within(screen.getByRole('navigation', { name: 'pagination' }))
}

describe('SellerProducts', () => {
  beforeEach(() => {
    resetSellerProducts()
    resetSellerProductDetails()
  })

  it('shows the empty state with no products', async () => {
    renderPage()
    expect(await screen.findByText('No products here')).toBeInTheDocument()
    // Once in the header, once in the empty state. Both open the add drawer
    // rather than navigating to a separate page - the design's "same drawer in
    // ADD mode".
    const buttons = screen.getAllByRole('button', { name: 'Add product' })
    expect(buttons).toHaveLength(2)

    await userEvent.click(buttons[1])
    expect(await screen.findByRole('dialog', { name: 'Product form' })).toBeInTheDocument()
  })

  it('lists products with their category, variants and stock', async () => {
    seed()
    renderPage()

    expect(await screen.findByText('Trail Backpack')).toBeInTheDocument()
    expect(screen.getByText('Outdoor')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // Price range across the variants, and their stock summed.
    expect(screen.getByText('$49.99–$59.99')).toBeInTheDocument()
    // The design prints the stock with its unit, and pills it when it is low.
    expect(screen.getByText('11 in stock')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('filters by search term', async () => {
    seed()
    seed({ id: 'p2', slug: 'desk-lamp', title: 'Desk Lamp' })
    renderPage()
    await screen.findByText('Trail Backpack')

    await userEvent.type(screen.getByLabelText('Search products'), 'lamp')

    expect(await screen.findByText('Desk Lamp')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Trail Backpack')).not.toBeInTheDocument())
  })

  it('asks before deleting, and keeps the product if you decline', async () => {
    seed()
    renderPage()
    await screen.findByText('Trail Backpack')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trail Backpack' }))
    await userEvent.click(screen.getByRole('button', { name: 'No' }))

    expect(screen.getByText('Trail Backpack')).toBeInTheDocument()
  })

  it('deletes a product once confirmed', async () => {
    seed()
    renderPage()
    await screen.findByText('Trail Backpack')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trail Backpack' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))

    await waitFor(() => expect(screen.queryByText('Trail Backpack')).not.toBeInTheDocument())
    expect(await screen.findByText('No products here')).toBeInTheDocument()
  })

  it('reads a page param that is not a number as the first page', async () => {
    seed()
    renderPage('/seller/products?page=abc')

    // NaN used to reach the request, which answered with nothing at all.
    expect(await screen.findByText('Trail Backpack')).toBeInTheDocument()
  })

  it('puts the search box back in step with the URL when the filters are cleared', async () => {
    seed()
    seed({ id: 'p2', slug: 'desk-lamp', title: 'Desk Lamp' })
    renderPage()
    await screen.findByText('Trail Backpack')

    const search = screen.getByLabelText('Search products')
    await userEvent.type(search, 'lamp')
    await waitFor(() => expect(screen.queryByText('Trail Backpack')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    // The box used to keep the cleared term while the list behind it went back
    // to showing everything.
    expect(search).toHaveValue('')
    expect(await screen.findByText('Trail Backpack')).toBeInTheDocument()
  })

  it('leaves one history entry behind a typed search, and its own for a filter', async () => {
    seed()
    seed({ id: 'p2', slug: 'desk-lamp', title: 'Desk Lamp' })
    const router = renderWithHistory(['/seller/products'])
    await screen.findByText('Trail Backpack')

    await userEvent.type(screen.getByLabelText('Search products'), 'lamp')
    await waitFor(() => expect(router.state.location.search).toBe('?q=lamp'))
    expect(await screen.findByText('Desk Lamp')).toBeInTheDocument()

    // Every keystroke used to push, so escaping a four-letter search took four
    // Backs. One now lands on the list as it was before the typing started.
    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('Trail Backpack')).toBeInTheDocument()

    // A filter is a navigation, so it still leaves an entry to Back out of.
    await userEvent.click(screen.getByLabelText('Filter by status'))
    await userEvent.click(await screen.findByRole('option', { name: 'Draft' }))
    await waitFor(() => expect(router.state.location.search).toBe('?status=DRAFT'))

    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('Trail Backpack')).toBeInTheDocument()
  })

  it('says so when a delete fails instead of leaving the row unexplained', async () => {
    seed()
    server.use(
      http.delete('http://localhost:8080/products/:productId', () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/product-referenced',
            title: 'Conflict',
            status: 409,
            detail: 'This product is on an open order and cannot be deleted',
          },
          { status: 409 },
        ),
      ),
    )
    renderPage()
    await screen.findByText('Trail Backpack')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trail Backpack' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))

    // The confirm popover closes as soon as the request settles, so without
    // this the row simply stayed put and read as a delete that had worked.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This product is on an open order and cannot be deleted',
    )
    expect(screen.getByText('Trail Backpack')).toBeInTheDocument()
  })

  it('pages by number, and the range label counts the short last page', async () => {
    seedMany(8)
    renderPage('/seller/products?size=5')

    expect(await screen.findByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Showing 1\u20135 of 8')).toBeInTheDocument()
    expect(pager().getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(pager().getByRole('button', { name: '2' }))

    expect(await screen.findByText('Item 6')).toBeInTheDocument()
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument()
    // Three rows on the last page, not five - the label follows the rows.
    expect(screen.getByText('Showing 6\u20138 of 8')).toBeInTheDocument()
    expect(pager().getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
  })

  it('elides the middle of a long range instead of printing every page', async () => {
    seedMany(40)
    renderPage('/seller/products?size=5')
    await screen.findByText('Item 1')

    // Eight pages, seven slots: the first five, a gap, and the last.
    for (const label of ['1', '2', '3', '4', '5', '8']) {
      expect(pager().getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(pager().queryByRole('button', { name: '6' })).not.toBeInTheDocument()
    expect(pager().getByText('More pages')).toBeInTheDocument()
  })

  it('goes back to the first page when the page size changes', async () => {
    seedMany(8)
    const router = renderWithHistory(['/seller/products?size=5&page=1'])
    await screen.findByText('Item 6')

    await userEvent.click(screen.getByLabelText('Rows per page'))
    await userEvent.click(await screen.findByRole('option', { name: '20' }))

    // Page 2 of a 5-a-page list is nowhere in a 20-a-page one, so ?page= goes
    // with the size - the same reset every other filter does.
    await waitFor(() => expect(router.state.location.search).toBe('?size=20'))
    expect(await screen.findByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Showing 1\u20138 of 8')).toBeInTheDocument()
  })

  it('ignores a page size that is not one of the offered ones', async () => {
    const asked: (string | null)[] = []
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/products', ({ request }) => {
        const size = new URL(request.url).searchParams.get('size')
        // The header's "N products · N active" line asks for size=1 twice -
        // a count and one row, over the whole catalogue rather than the filtered
        // page. Those are not the list request this test is about.
        if (size !== '1') asked.push(size)
        return undefined // fall through to the default handler
      }),
    )
    seedMany(8)

    // ?size=10000 asked the server for the whole catalogue in one response, and
    // ?size=abc asked it for NaN of it.
    for (const junk of ['10000', 'abc']) {
      const view = renderPage(`/seller/products?size=${junk}`)
      expect(await screen.findByText('Item 1')).toBeInTheDocument()
      // Five a page over eight rows - the design's default - so the first page
      // stops at five.
      expect(screen.getByText('Showing 1\u20135 of 8')).toBeInTheDocument()
      view.unmount()
    }

    expect(asked.length).toBeGreaterThan(0)
    expect(asked.every((size) => size === '5')).toBe(true)
  })

  it('opens the edit drawer and expands it in place, with a way back', async () => {
    seed()
    renderPage()
    await screen.findByText('Trail Backpack')

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const drawer = await screen.findByRole('dialog', { name: 'Product form' })
    // A button, not a link: expanding keeps the same panel mounted so nothing
    // typed into the form is lost, where the old link opened a new browser tab.
    await userEvent.click(within(drawer).getByRole('button', { name: /Full page/ }))
    expect(within(drawer).getByRole('button', { name: /Back to panel/ })).toBeInTheDocument()

    await userEvent.click(within(drawer).getByRole('button', { name: /Back to panel/ }))
    expect(within(drawer).getByRole('button', { name: /Full page/ })).toBeInTheDocument()
  })

  it('opens the view drawer when a row is clicked, and swaps to the form from it', async () => {
    seed()
    renderPage()

    await userEvent.click(await screen.findByText('Trail Backpack'))

    const view = await screen.findByRole('dialog', { name: 'Product details' })
    expect(within(view).getByText('Open orders')).toBeInTheDocument()

    await userEvent.click(within(view).getByRole('button', { name: 'Edit product' }))
    // A mode swap between two drawers, not a tab inside one.
    expect(await screen.findByRole('dialog', { name: 'Product form' })).toBeInTheDocument()
  })
})
