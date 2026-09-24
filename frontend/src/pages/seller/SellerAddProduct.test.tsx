import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listSellerProducts, resetSellerProducts } from '@/test/msw/fixtures/sellerProducts'

import { SellerAddProduct } from './SellerAddProduct'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/seller/products/new']}>
        <Routes>
          <Route path="/seller/products/new" element={<SellerAddProduct />} />
          <Route path="/seller/products" element={<div>Products page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SellerAddProduct', () => {
  beforeEach(() => {
    resetSellerProducts()
    // jsdom/vitest's URL.createObjectURL chokes on File internals - stub it,
    // the actual blob URL value is never asserted on.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  })

  it('creates a product with one variant and redirects to the list', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Title'), 'Trail Backpack')
    await userEvent.type(screen.getByLabelText('Category'), 'outdoor')
    await userEvent.type(screen.getByLabelText('Variant 1 label'), 'Standard')
    await userEvent.type(screen.getByLabelText('Variant 1 SKU'), 'SKU-1')
    await userEvent.type(screen.getByLabelText('Variant 1 price'), '19.99')
    await userEvent.type(screen.getByLabelText('Variant 1 stock quantity'), '10')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Products page')).toBeInTheDocument()
    expect(listSellerProducts()).toHaveLength(1)
    expect(listSellerProducts()[0]).toMatchObject({ title: 'Trail Backpack', variantCount: 1 })
  })

  it('cannot remove the only variant row, but can add and remove extra rows', async () => {
    renderPage()

    expect(screen.getByRole('button', { name: 'Remove variant 1' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Add variant' }))
    expect(screen.getByRole('button', { name: 'Remove variant 1' })).not.toBeDisabled()
    expect(screen.getByLabelText('Variant 2 label')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove variant 2' }))
    expect(screen.queryByLabelText('Variant 2 label')).not.toBeInTheDocument()
  })

  it('stages, reorders, and removes images before upload', async () => {
    renderPage()

    const fileInput = screen.getByLabelText('Add images', { selector: 'input' })
    const fileA = new File(['a'], 'a.png', { type: 'image/png' })
    const fileB = new File(['b'], 'b.png', { type: 'image/png' })
    await userEvent.upload(fileInput, [fileA, fileB])

    expect(screen.getByRole('button', { name: 'Remove image 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove image 2' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Move image 2 earlier' }))
    // after swapping, "image 2" (now in slot 1) can no longer move earlier
    expect(screen.getByRole('button', { name: 'Move image 1 earlier' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Remove image 1' }))
    expect(screen.queryByRole('button', { name: 'Remove image 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove image 1' })).toBeInTheDocument()
  })
})
