import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
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

describe('SellerProducts', () => {
  beforeEach(() => {
    resetSellerProducts()
    resetSellerProductDetails()
  })

  it('shows the empty state with no products', async () => {
    renderPage()
    expect(await screen.findByText('No products here')).toBeInTheDocument()
    // Once in the header, once in the empty state.
    for (const link of screen.getAllByRole('link', { name: 'Add product' })) {
      expect(link).toHaveAttribute('href', '/seller/products/new')
    }
  })

  it('lists products with their category, variants and stock', async () => {
    seed()
    renderPage()

    expect(await screen.findByText('Trail Backpack')).toBeInTheDocument()
    expect(screen.getByText('Outdoor')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // Price range across the variants, and their stock summed.
    expect(screen.getByText('$49.99–$59.99')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))

    expect(screen.getByText('Trail Backpack')).toBeInTheDocument()
  })

  it('deletes a product once confirmed', async () => {
    seed()
    renderPage()
    await screen.findByText('Trail Backpack')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trail Backpack' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))

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
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))

    // The confirm popover closes as soon as the request settles, so without
    // this the row simply stayed put and read as a delete that had worked.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This product is on an open order and cannot be deleted',
    )
    expect(screen.getByText('Trail Backpack')).toBeInTheDocument()
  })

  it('opens the edit drawer with a link to the same form full page', async () => {
    seed()
    renderPage()
    await screen.findByText('Trail Backpack')

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByRole('link', { name: /Full page/ })).toHaveAttribute(
      'href',
      '/seller/products/p1',
    )
  })
})
