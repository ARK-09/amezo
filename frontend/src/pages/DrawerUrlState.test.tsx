import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { listBuyerOrders } from '@/test/msw/fixtures/buyerOrders'
import { resetRefundRequests } from '@/test/msw/fixtures/refunds'
import { signInBuyerSession } from '@/test/msw/fixtures/sellerAuth'
import { resetSellerOrders } from '@/test/msw/fixtures/sellerOrders'
import {
  addSellerProduct,
  resetSellerProductDetails,
  resetSellerProducts,
} from '@/test/msw/fixtures/sellerProducts'

import { MyOrders } from './MyOrders'
import { SellerOrders } from './seller/SellerOrders'
import { SellerProducts } from './seller/SellerProducts'
import { SellerRefunds } from './seller/SellerRefunds'

/**
 * The URL is the source of truth for the open record, and the same two parameters do
 * it on every table in the app.
 *
 * These pages used to hold the open record in useState, which meant a refresh closed
 * the drawer, a shared link opened the list and not the record, and Back left the
 * drawer sitting over a table that had moved underneath it. This file is the guard on
 * all four screens at once, because the point is that they behave the SAME - a
 * per-page test would let the next one invent its own parameter names.
 */

/** A real history, so a test can press Back and Forward the way a browser does. */
function renderAt(path: string, Component: () => React.ReactElement, entries: string[]) {
  const router = createMemoryRouter([{ path, Component }], {
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

function query(router: ReturnType<typeof renderAt>) {
  return new URLSearchParams(router.state.location.search)
}

const PRODUCT_ID = 'p1'
const ORDER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const OTHER_ORDER_ID = 'bbbbbbbb-0000-0000-0000-000000000002'

function seedProduct() {
  addSellerProduct({
    id: PRODUCT_ID,
    slug: 'trail-backpack',
    title: 'Trail Backpack',
    thumbnailUrl: null,
    category: { slug: 'outdoor', name: 'Outdoor' },
    variantCount: 2,
    createdAt: '2026-01-01T00:00:00Z',
  })
}

function seedOrders() {
  const line = {
    id: 'l1',
    productTitle: 'Backpack',
    variantLabel: 'Blue',
    quantity: 2,
    unitPrice: 25,
    lineTotal: 50,
  }
  resetSellerOrders([
    {
      id: ORDER_ID,
      buyerEmail: 'maya@example.com',
      placedAt: '2026-01-03T00:00:00Z',
      total: 50,
      status: 'PLACED',
      lines: [line],
    },
    {
      id: OTHER_ORDER_ID,
      buyerEmail: 'jonas@example.com',
      placedAt: '2026-01-01T00:00:00Z',
      total: 120,
      status: 'SHIPPED',
      trackingNumber: 'AZ123',
      lines: [{ ...line, unitPrice: 60, lineTotal: 120 }],
    },
  ])
}

beforeEach(() => {
  resetSellerProducts()
  resetSellerProductDetails()
  resetRefundRequests()
})

describe('drawer state in the URL', () => {
  describe('Seller Products', () => {
    it('opens a record straight from the URL in view mode', async () => {
      seedProduct()
      renderAt('/seller/products', SellerProducts, [
        `/seller/products?id=${PRODUCT_ID}&mode=view`,
      ])

      // No click: the drawer is open because the URL says so, which is what makes a
      // refresh and a pasted link work.
      expect(await screen.findByRole('dialog', { name: 'Product details' })).toBeInTheDocument()
    })

    it('opens a record straight from the URL in edit mode', async () => {
      seedProduct()
      renderAt('/seller/products', SellerProducts, [
        `/seller/products?id=${PRODUCT_ID}&mode=edit`,
      ])

      expect(await screen.findByRole('dialog', { name: 'Product form' })).toBeInTheDocument()
      // The edit drawer, not the view drawer that happens to have a form in it.
      expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    })

    it('opens the create drawer from ?id=new&mode=create', async () => {
      renderAt('/seller/products', SellerProducts, ['/seller/products?id=new&mode=create'])

      const form = await screen.findByRole('dialog', { name: 'Product form' })
      // The create drawer, titled for a product that does not exist yet - not the edit
      // drawer, which names the record it is changing.
      expect(await within(form).findByText('Add product')).toBeInTheDocument()
    })

    it('writes id and mode when a record is opened, and only those on close', async () => {
      seedProduct()
      const router = renderAt('/seller/products', SellerProducts, [
        '/seller/products?q=trail&status=ACTIVE&sort=oldest&page=0&size=5',
      ])

      await userEvent.click(await screen.findByText('Trail Backpack'))
      await screen.findByRole('dialog', { name: 'Product details' })

      expect(query(router).get('id')).toBe(PRODUCT_ID)
      expect(query(router).get('mode')).toBe('view')
      // Opening a record does not disturb the table underneath it.
      expect(query(router).get('q')).toBe('trail')
      expect(query(router).get('status')).toBe('ACTIVE')
      expect(query(router).get('sort')).toBe('oldest')
      expect(query(router).get('size')).toBe('5')

      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(query(router).has('id')).toBe(false))
      expect(query(router).has('mode')).toBe(false)
      // And the table is exactly where it was left.
      expect(query(router).get('q')).toBe('trail')
      expect(query(router).get('status')).toBe('ACTIVE')
      expect(query(router).get('sort')).toBe('oldest')
      expect(query(router).get('size')).toBe('5')
    })

    it('records the mode swap in the URL rather than beside it', async () => {
      seedProduct()
      const router = renderAt('/seller/products', SellerProducts, [
        `/seller/products?id=${PRODUCT_ID}&mode=view`,
      ])

      const view = await screen.findByRole('dialog', { name: 'Product details' })
      await userEvent.click(within(view).getByRole('button', { name: 'Edit product' }))

      await screen.findByRole('dialog', { name: 'Product form' })
      expect(query(router).get('mode')).toBe('edit')
      expect(query(router).get('id')).toBe(PRODUCT_ID)
    })

    it('restores the record and the mode through Back and Forward', async () => {
      seedProduct()
      const router = renderAt('/seller/products', SellerProducts, ['/seller/products'])

      await userEvent.click(await screen.findByText('Trail Backpack'))
      const view = await screen.findByRole('dialog', { name: 'Product details' })
      await userEvent.click(within(view).getByRole('button', { name: 'Edit product' }))
      await screen.findByRole('dialog', { name: 'Product form' })

      // Back from edit lands on view - the mode is a history entry of its own.
      await act(() => router.navigate(-1))
      expect(await screen.findByRole('dialog', { name: 'Product details' })).toBeInTheDocument()

      // Back again closes it, because opening pushed an entry.
      await act(() => router.navigate(-1))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      // And Forward reopens the same record in the same mode.
      await act(() => router.navigate(1))
      expect(await screen.findByRole('dialog', { name: 'Product details' })).toBeInTheDocument()
      expect(query(router).get('id')).toBe(PRODUCT_ID)
    })

    it('opens a record the current page does not contain', async () => {
      seedProduct()
      renderAt('/seller/products', SellerProducts, [
        // A filter that hides the record, which is what a shared link into a
        // colleague's filtered view looks like. The drawer is not derived from the
        // list, so it opens anyway and names the product from its own request.
        `/seller/products?q=nothing-matches&id=${PRODUCT_ID}&mode=view`,
      ])

      const view = await screen.findByRole('dialog', { name: 'Product details' })
      // Named from its own request, not from a row: there is no row on this page.
      expect(await within(view).findByText('Trail Backpack')).toBeInTheDocument()
    })
  })

  describe('Seller Orders', () => {
    it('opens an order straight from the URL and keeps the table state', async () => {
      seedOrders()
      const router = renderAt('/seller/orders', SellerOrders, [
        `/seller/orders?group=to_pack&sort=oldest&size=5&id=${ORDER_ID}&mode=view`,
      ])

      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(query(router).get('group')).toBe('to_pack')
      expect(query(router).get('sort')).toBe('oldest')
      expect(query(router).get('size')).toBe('5')
    })

    it('puts the opened order in the URL and takes it out again on close', async () => {
      seedOrders()
      const router = renderAt('/seller/orders', SellerOrders, ['/seller/orders?q=maya'])

      await userEvent.click(await screen.findByRole('button', { name: 'Open' }))
      await screen.findByRole('dialog')
      expect(query(router).get('id')).toBe(ORDER_ID)
      expect(query(router).get('mode')).toBe('view')

      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(query(router).has('id')).toBe(false))
      expect(query(router).get('q')).toBe('maya')
    })

    it('reopens the order on Back', async () => {
      seedOrders()
      const router = renderAt('/seller/orders', SellerOrders, ['/seller/orders'])

      await userEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0])
      await screen.findByRole('dialog')
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await act(() => router.navigate(-1))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('Seller Refunds', () => {
    it('opens a refund request straight from the URL', async () => {
      renderAt('/seller/refunds', SellerRefunds, ['/seller/refunds?id=ref-1&mode=view'])

      const drawer = await screen.findByRole('dialog', { name: 'Refund request' })
      // The drawer is open from the first render because the URL says so; the row it
      // draws its header from arrives with the list a request later.
      expect(await within(drawer).findByText('ref_4d90b12c')).toBeInTheDocument()
    })

    it('keeps the queue tab and page when a request is opened', async () => {
      const router = renderAt('/seller/refunds', SellerRefunds, [
        '/seller/refunds?status=REQUESTED&size=5',
      ])

      await userEvent.click((await screen.findAllByRole('button', { name: 'Review' }))[0])
      await screen.findByRole('dialog', { name: 'Refund request' })

      expect(query(router).get('id')).toBe('ref-1')
      expect(query(router).get('mode')).toBe('view')
      expect(query(router).get('status')).toBe('REQUESTED')
      expect(query(router).get('size')).toBe('5')
    })
  })

  describe('buyer My Orders', () => {
    it('expands the order named in the URL', async () => {
      signInBuyerSession({ buyerIdentityId: 'buyer-1111', email: 'rhea@example.com' })
      const orderId = listBuyerOrders()[0].id
      renderAt('/orders', MyOrders, [`/orders?id=${orderId}&mode=view`])

      // The card's own detail arrives on expansion, so this is the expanded card and
      // not just the summary row.
      expect(await screen.findByRole('button', { name: /Hide details/ })).toBeInTheDocument()
    })

    it('writes the expanded order into the URL and clears it on collapse', async () => {
      signInBuyerSession({ buyerIdentityId: 'buyer-1111', email: 'rhea@example.com' })
      const router = renderAt('/orders', MyOrders, ['/orders?group=delivered'])

      await userEvent.click((await screen.findAllByRole('button', { name: /details/ }))[0])
      await waitFor(() => expect(query(router).has('id')).toBe(true))
      expect(query(router).get('mode')).toBe('view')
      expect(query(router).get('group')).toBe('delivered')

      await userEvent.click(screen.getByRole('button', { name: /Hide details/ }))
      await waitFor(() => expect(query(router).has('id')).toBe(false))
      expect(query(router).get('group')).toBe('delivered')
    })
  })
})
