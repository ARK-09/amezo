import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { addSellerProduct, resetSellerProducts } from '@/test/msw/fixtures/sellerProducts'

import { SellerProducts } from './SellerProducts'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SellerProducts />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SellerProducts', () => {
  beforeEach(() => resetSellerProducts())

  it('shows the empty state with no products', async () => {
    renderPage()
    expect(await screen.findByText('No products yet')).toBeInTheDocument()
  })

  it('lists products with their variant count and category', async () => {
    addSellerProduct({
      id: 'p1',
      title: 'Trail Backpack',
      thumbnailUrl: null,
      category: 'outdoor',
      variantCount: 2,
      createdAt: '2026-01-01T00:00:00Z',
    })

    renderPage()

    expect(await screen.findByText('Trail Backpack')).toBeInTheDocument()
    expect(screen.getByText('outdoor')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('deletes a product', async () => {
    addSellerProduct({
      id: 'p1',
      title: 'Trail Backpack',
      thumbnailUrl: null,
      category: 'outdoor',
      variantCount: 1,
      createdAt: '2026-01-01T00:00:00Z',
    })

    renderPage()
    await screen.findByText('Trail Backpack')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trail Backpack' }))

    await waitFor(() => expect(screen.queryByText('Trail Backpack')).not.toBeInTheDocument())
    expect(await screen.findByText('No products yet')).toBeInTheDocument()
  })
})
