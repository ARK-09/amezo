import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { ProductTile } from '@/features/catalog/components/ProductTile'
import { createAppQueryClient } from '@/lib/api/queryClient'
import type { ProductSummary } from '@/features/search/schema/types'

const BASE: ProductSummary = {
  id: 'p-1',
  slug: 'trail-backpack',
  sellerId: 'seller-1',
  title: 'Trail Backpack',
  brandName: 'Summit',
  category: { slug: 'outdoor', name: 'Outdoor' },
  priceFrom: 79.99,
  thumbnailUrl: null,
  avgRating: 4.5,
  reviewCount: 128,
  inStock: true,
  defaultVariantId: 'v-1',
  defaultVariantPrice: 79.99,
}

function renderTile(product: ProductSummary) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <CartProvider>
        <MemoryRouter>
          <ProductTile product={product} />
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

describe('product card rating', () => {
  it('shows the API rating and how many reviews it is over', () => {
    renderTile(BASE)

    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByLabelText('128 reviews')).toHaveTextContent('(128)')
  })

  it('renders whatever the API returns, rounded to one decimal', () => {
    renderTile({ ...BASE, avgRating: 3.26, reviewCount: 9 })

    expect(screen.getByText('3.3')).toBeInTheDocument()
    expect(screen.getByLabelText('9 reviews')).toBeInTheDocument()
  })

  /** Most of the catalog. It must read as unreviewed, not as a broken badge. */
  it('says so plainly when a product has no reviews', () => {
    renderTile({ ...BASE, avgRating: null, reviewCount: 0 })

    expect(screen.getByText('No reviews yet')).toBeInTheDocument()
    expect(screen.queryByText('0.0')).not.toBeInTheDocument()
  })

  /**
   * A count with no average, which is what a half-written aggregate would look like.
   * Showing "No reviews yet" beats inventing a score.
   */
  it('does not invent a score when the average is missing', () => {
    renderTile({ ...BASE, avgRating: null, reviewCount: 4 })

    expect(screen.getByText('No reviews yet')).toBeInTheDocument()
  })
})
