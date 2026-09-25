import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  findSellerProductDetail,
  resetSellerProductDetails,
  resetSellerProducts,
  TAKEN_SKU,
} from '@/test/msw/fixtures/sellerProducts'

import { SellerProductDetail } from './SellerProductDetail'

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111'

function renderPage(productId = PRODUCT_ID) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/seller/products/${productId}`]}>
        <Routes>
          <Route path="/seller/products/:productId" element={<SellerProductDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SellerProductDetail', () => {
  beforeEach(() => {
    resetSellerProducts([
      {
        id: PRODUCT_ID,
        title: 'Trail Backpack',
        thumbnailUrl: null,
        category: 'Outdoor',
        variantCount: 2,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    resetSellerProductDetails()
  })

  it('shows the product fields and every variant with its stock', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('Trail Backpack')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Outdoor')).toBeInTheDocument()

    const detail = findSellerProductDetail(PRODUCT_ID)!
    for (const variant of detail.variants) {
      expect(screen.getByLabelText(`SKU for ${variant.sku}`)).toHaveValue(variant.sku)
      expect(screen.getByLabelText(`Stock for ${variant.sku}`)).toHaveValue(variant.stockQty)
    }
  })

  /** Save stays disabled until something changes - nothing to submit otherwise. */
  it('only enables Save once a field is edited', async () => {
    renderPage()
    const title = await screen.findByDisplayValue('Trail Backpack')
    const save = screen.getByRole('button', { name: 'Save changes' })

    expect(save).toBeDisabled()
    await userEvent.type(title, ' Pro')
    expect(save).toBeEnabled()
  })

  it('saves an edited title and leaves the other fields untouched', async () => {
    renderPage()
    const title = await screen.findByDisplayValue('Trail Backpack')

    await userEvent.clear(title)
    await userEvent.type(title, 'Trail Backpack 40L')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.title).toBe('Trail Backpack 40L')
    })
    // Untouched fields keep their values rather than being rewritten with the
    // form's own copy - the PATCH only carries what changed.
    expect(findSellerProductDetail(PRODUCT_ID)!.description).toBe('Demo description.')
    expect(findSellerProductDetail(PRODUCT_ID)!.category).toBe('Outdoor')
  })

  it('saves one variant without touching the others', async () => {
    renderPage()
    const detail = findSellerProductDetail(PRODUCT_ID)!
    const [first, second] = detail.variants
    const secondStockBefore = second.stockQty

    const stock = await screen.findByLabelText(`Stock for ${first.sku}`)
    await userEvent.clear(stock)
    await userEvent.type(stock, '42')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.variants[0].stockQty).toBe(42)
    })
    expect(findSellerProductDetail(PRODUCT_ID)!.variants[1].stockQty).toBe(secondStockBefore)
  })

  /** Stock 0 is how a seller stops selling a variant, so it must be savable. */
  it('accepts a stock of zero', async () => {
    renderPage()
    const detail = findSellerProductDetail(PRODUCT_ID)!
    const stock = await screen.findByLabelText(`Stock for ${detail.variants[0].sku}`)

    await userEvent.clear(stock)
    await userEvent.type(stock, '0')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.variants[0].stockQty).toBe(0)
    })
  })

  it('shows the API error inline when a SKU is already taken', async () => {
    renderPage()
    const detail = findSellerProductDetail(PRODUCT_ID)!
    const sku = await screen.findByLabelText(`SKU for ${detail.variants[0].sku}`)

    await userEvent.clear(sku)
    await userEvent.type(sku, TAKEN_SKU)
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `SKU ${TAKEN_SKU} belongs to another variant`,
    )
  })

  it('shows a retryable error when the product does not exist', async () => {
    renderPage('99999999-9999-9999-9999-999999999999')

    expect(await screen.findByText("Couldn't load this product")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
