import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/test/msw/server'

import { CartProvider } from '../context/CartProvider'
import type { CartLine } from '../schema/types'
import { CartDrawer } from './CartDrawer'
import { CartTrigger } from './CartTrigger'

const HEADPHONES_ID = '11111111-1111-1111-1111-111111111111'
const COOKWARE_ID = '33333333-3333-3333-3333-333333333333'
const SHOES_ID = '44444444-4444-4444-4444-444444444444'

function seedCart(lines: CartLine[]) {
  localStorage.setItem('cart:v1', JSON.stringify(lines))
}

function renderDrawer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CartProvider>
          <CartTrigger />
          <CartDrawer />
        </CartProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openDrawer() {
  await userEvent.click(screen.getByRole('button', { name: /Open cart/ }))
}

describe('CartDrawer', () => {
  it('shows the empty state with no lines', async () => {
    seedCart([])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
  })

  it('shows the item count on the trigger badge', async () => {
    seedCart([
      { variantId: `${HEADPHONES_ID}-v1`, quantity: 2, priceWhenAdded: 129.99 },
      { variantId: `${COOKWARE_ID}-v1`, quantity: 1, priceWhenAdded: 74.5 },
    ])
    renderDrawer()
    expect(await screen.findByText('3')).toBeInTheDocument()
  })

  it('renders a line with the live title, variant, and unit price', async () => {
    seedCart([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 }])
    renderDrawer()
    await openDrawer()

    expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument()
    expect(screen.getByText('Black')).toBeInTheDocument()
    expect(screen.getByText('$129.99 each')).toBeInTheDocument()
  })

  it('sums the total across lines using live prices', async () => {
    seedCart([
      { variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 },
      { variantId: `${COOKWARE_ID}-v1`, quantity: 1, priceWhenAdded: 74.5 },
    ])
    renderDrawer()
    await openDrawer()
    await screen.findByText('Wireless Noise-Cancelling Headphones')
    expect(screen.getByText('$204.49')).toBeInTheDocument()
  })

  it('shows "No longer available" for an offer that no longer exists', async () => {
    seedCart([{ variantId: 'ghost-variant', quantity: 1, priceWhenAdded: 10 }])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('No longer available')).toBeInTheDocument()
  })

  it('marks a line out of stock', async () => {
    seedCart([{ variantId: `${SHOES_ID}-v1`, quantity: 1, priceWhenAdded: 64 }])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('Out of stock')).toBeInTheDocument()
  })

  it('caps quantity and warns when stock is below cart quantity', async () => {
    seedCart([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 10, priceWhenAdded: 129.99 }])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('Only 8 left')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled()
  })

  it('shows a price-change notice and can dismiss it', async () => {
    seedCart([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 99.99 }])
    renderDrawer()
    await openDrawer()

    expect(await screen.findByText(/Price updated: was \$99\.99, now \$129\.99/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByText(/Price updated/)).not.toBeInTheDocument())
  })

  it('removes a line', async () => {
    seedCart([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 }])
    renderDrawer()
    await openDrawer()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    await userEvent.click(screen.getByRole('button', { name: 'Remove from cart' }))
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
  })

  it('clears all lines', async () => {
    seedCart([
      { variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 },
      { variantId: `${COOKWARE_ID}-v1`, quantity: 1, priceWhenAdded: 74.5 },
    ])
    renderDrawer()
    await openDrawer()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    await userEvent.click(screen.getByRole('button', { name: 'Clear cart' }))
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
  })

  it('does not render lines as "No longer available" when the batch fetch errors', async () => {
    seedCart([
      { variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 },
      { variantId: `${COOKWARE_ID}-v1`, quantity: 1, priceWhenAdded: 74.5 },
    ])
    server.use(
      http.get(
        'http://localhost:8080/variants',
        () =>
          HttpResponse.json(
            { type: 'about:blank', title: 'Internal error', status: 500, detail: 'Lookup blew up' },
            { status: 500 },
          ),
        { once: true },
      ),
    )
    renderDrawer()
    await openDrawer()

    expect(await screen.findByText('Lookup blew up')).toBeInTheDocument()
    expect(screen.queryByText('No longer available')).not.toBeInTheDocument()
  })

  it('removing one line does not flicker the remaining line to a loading skeleton', async () => {
    seedCart([
      { variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 },
      { variantId: `${COOKWARE_ID}-v1`, quantity: 1, priceWhenAdded: 74.5 },
    ])
    renderDrawer()
    await openDrawer()
    await screen.findByText('Wireless Noise-Cancelling Headphones')
    await screen.findByText('Ceramic Non-Stick Cookware Set (10-piece)')

    // fireEvent (not userEvent) so the assertion below runs synchronously,
    // before the refetch's microtask can resolve and mask a flicker.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from cart' })[0])

    expect(screen.getByText('Ceramic Non-Stick Cookware Set (10-piece)')).toBeInTheDocument()
  })

  it('does not show "No longer available" for a newly-added line while its offer is still loading', async () => {
    const lineA: CartLine = { variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 }
    const lineB: CartLine = { variantId: `${COOKWARE_ID}-v1`, quantity: 1, priceWhenAdded: 74.5 }

    // Seed and cache only line A first (mirrors the drawer already being open
    // with one item), so the query has previous data for keepPreviousData to
    // serve as a placeholder once a second, different query key shows up.
    seedCart([lineA])
    renderDrawer()
    await openDrawer()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    // Simulate a second line being added while the drawer stays open and
    // mounted - the same cross-tab sync path CartContext listens for. This
    // changes the query key (now [A, B]) while old data (just A) is cached,
    // so TanStack Query serves the old data as a placeholder for B's id too.
    act(() => {
      localStorage.setItem('cart:v1', JSON.stringify([lineA, lineB]))
      window.dispatchEvent(new StorageEvent('storage', { key: 'cart:v1' }))
    })

    // Right after the key changes, B has no entry in the (placeholder) data
    // yet - it must render as loading, not as "gone".
    expect(screen.queryByText('No longer available')).not.toBeInTheDocument()

    await screen.findByText('Ceramic Non-Stick Cookware Set (10-piece)')
    expect(screen.queryByText('No longer available')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    seedCart([])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument())
  })

  it('traps focus inside the drawer while open', async () => {
    seedCart([])
    renderDrawer()
    await openDrawer()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
})
