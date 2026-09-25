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
  it('adds a variant and keeps the existing rows', async () => {
    renderPage()
    const before = (await screen.findAllByRole('button', { name: 'Save' })).length

    await userEvent.click(screen.getByRole('button', { name: /Add variant/ }))
    await userEvent.type(screen.getByLabelText('New variant label'), 'XL')
    await userEvent.type(screen.getByLabelText('New variant SKU'), 'TB-XL')
    await userEvent.type(screen.getByLabelText('New variant price'), '59.99')
    await userEvent.type(screen.getByLabelText('New variant stock'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Add variant' }))

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.variants.map((v) => v.sku)).toContain('TB-XL')
    })
    expect(await screen.findByDisplayValue('TB-XL')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Save' }).length).toBe(before + 1)
  })

  it('shows the error inline when the new variant reuses a SKU', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Add variant/ }))
    await userEvent.type(screen.getByLabelText('New variant label'), 'Clash')
    await userEvent.type(screen.getByLabelText('New variant SKU'), TAKEN_SKU)
    await userEvent.type(screen.getByLabelText('New variant price'), '1')
    await userEvent.type(screen.getByLabelText('New variant stock'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Add variant' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(TAKEN_SKU)
  })

  it('removes a variant', async () => {
    renderPage()
    const detail = findSellerProductDetail(PRODUCT_ID)!
    const doomed = detail.variants[1]

    await userEvent.click(await screen.findByRole('button', { name: `Remove ${doomed.sku}` }))

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.variants.map((v) => v.id)).not.toContain(doomed.id)
    })
  })

  /** The API refuses it, so the button shouldn't offer it in the first place. */
  it('disables removal when only one variant is left', async () => {
    resetSellerProducts([
      {
        id: PRODUCT_ID,
        title: 'Single Variant',
        thumbnailUrl: null,
        category: 'Outdoor',
        variantCount: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    resetSellerProductDetails()
    renderPage()

    const detail = findSellerProductDetail(PRODUCT_ID)!
    expect(await screen.findByRole('button', { name: `Remove ${detail.variants[0].sku}` })).toBeDisabled()
  })

  it('removes an image', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = [
      { id: 'image-1', url: 'https://cdn.example/1.jpg', position: 0, status: 'STORED' },
      { id: 'image-2', url: 'https://cdn.example/2.jpg', position: 1, status: 'STORED' },
    ]
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Remove image 1' }))

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.images.map((i) => i.id)).toEqual(['image-2'])
    })
  })

  it('stops offering uploads at the image cap', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = Array.from({ length: 7 }, (_, i) => ({
      id: `image-${i}`,
      url: `https://cdn.example/${i}.jpg`,
      position: i,
      status: 'STORED' as const,
    }))
    renderPage()

    expect(await screen.findByRole('button', { name: /Add image/ })).toBeDisabled()
    expect(screen.getByText('Remove one to add another')).toBeInTheDocument()
  })
})
