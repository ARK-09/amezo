import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CartProvider, useCartState } from '@/features/cart/context/CartContext'
import { STORAGE_KEY } from '@/features/cart/storage'
import type { ProductSummary } from '@/features/search/schema/types'

import { ProductTile } from './ProductTile'

const PRODUCT: ProductSummary = {
  id: 'p-1',
  title: 'Trail Backpack',
  brandName: 'Summit',
  category: 'Outdoor',
  priceFrom: 79.99,
  thumbnailUrl: null,
  avgRating: 4.5,
  inStock: true,
  defaultVariantId: 'v-1',
  defaultVariantPrice: 84.99,
}

function CartReadout() {
  const { lines, itemCount } = useCartState()
  return (
    <div>
      <span data-testid="count">{itemCount}</span>
      <span data-testid="lines">{JSON.stringify(lines)}</span>
    </div>
  )
}

function renderTile(product: ProductSummary = PRODUCT) {
  return render(
    <CartProvider>
      <MemoryRouter>
        <ProductTile product={product} />
        <CartReadout />
      </MemoryRouter>
    </CartProvider>,
  )
}

describe('ProductTile add to cart', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  /**
   * The point of the whole change: the summary carries the variant, so the click
   * is a reducer dispatch. No fetch at all - not a fast one, none - because the
   * cart lives in localStorage and had no business waiting on the network.
   */
  it('adds to the cart without issuing any request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderTile()

    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    expect(screen.getByTestId('count')).toHaveTextContent('1')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('stores the default variant and its own price, not priceFrom', async () => {
    renderTile()

    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    const lines = JSON.parse(screen.getByTestId('lines').textContent!)
    expect(lines).toEqual([{ variantId: 'v-1', quantity: 1, priceWhenAdded: 84.99 }])
  })

  /** Persistence happens after the render, so the click is never blocked by it. */
  it('persists the cart to localStorage', async () => {
    renderTile()

    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([
      { variantId: 'v-1', quantity: 1, priceWhenAdded: 84.99 },
    ])
  })

  it('clicking twice adds two of the same variant', async () => {
    renderTile()
    const button = screen.getByRole('button', { name: 'Add to cart' })

    await userEvent.click(button)
    await userEvent.click(button)

    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('is disabled when the product is out of stock', () => {
    renderTile({ ...PRODUCT, inStock: false })
    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled()
  })

  /** A product with no offers has nothing to add, so the button can't be pressed. */
  it('is disabled when there is no default variant', () => {
    renderTile({ ...PRODUCT, defaultVariantId: null, defaultVariantPrice: null })
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
  })

  it('falls back to priceFrom if the default variant carries no price', async () => {
    renderTile({ ...PRODUCT, defaultVariantPrice: null })

    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    const lines = JSON.parse(screen.getByTestId('lines').textContent!)
    expect(lines[0].priceWhenAdded).toBe(79.99)
  })
})
