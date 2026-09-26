import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import {
  addSellerProduct,
  resetSellerProductDetails,
  resetSellerProducts,
} from '@/test/msw/fixtures/sellerProducts'

import { SellerProducts } from './SellerProducts'

function renderPage() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
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
