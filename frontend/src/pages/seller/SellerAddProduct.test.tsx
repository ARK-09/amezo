import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/test/msw/server'

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
    // Chosen from the system list. There is no field to type a category into any
    // more, which is the point of the change.
    await userEvent.click(screen.getByRole('combobox', { name: 'Category' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Search category' }), 'Outdoor')
    await userEvent.click(await screen.findByRole('option', { name: 'Outdoor' }))
    await userEvent.type(screen.getByLabelText('Variant 1 label'), 'Standard')
    await userEvent.type(screen.getByLabelText('Variant 1 SKU'), 'SKU-1')
    await userEvent.type(screen.getByLabelText('Variant 1 price'), '19.99')
    await userEvent.type(screen.getByLabelText('Variant 1 stock quantity'), '10')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Products page')).toBeInTheDocument()
    expect(listSellerProducts()).toHaveLength(1)
    expect(listSellerProducts()[0]).toMatchObject({ title: 'Trail Backpack', variantCount: 1 })
  })

  /** Number('') is 0, so an unpriced variant used to be created at $0.00. */
  it('refuses a variant priced at zero', async () => {
    renderPage()
    await fillProduct({ price: '0', stockQty: '5' })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Variant 1 needs a price above 0.')).toBeInTheDocument()
    expect(listSellerProducts()).toHaveLength(0)
  })

  /** Zero stock is a real listing - the product exists, it is just sold out. */
  it('creates a product with a stock of zero', async () => {
    renderPage()
    await fillProduct({ price: '19.99', stockQty: '0' })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Products page')).toBeInTheDocument()
    expect(listSellerProducts()).toHaveLength(1)
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

  /**
   * Without this the only route to a draft is to publish the listing first and
   * unpublish it afterwards - live in search for as long as that takes.
   */
  it('creates a new listing as a draft', async () => {
    const bodies = captureCreateBodies()
    renderPage()
    await fillProduct({ price: '19.99', stockQty: '5' })

    await userEvent.click(screen.getByRole('switch', { name: 'Active' }))
    expect(screen.getByText(/hidden from shoppers until you activate it/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Products page')).toBeInTheDocument()
    expect(bodies.at(-1)).toMatchObject({ title: 'Trail Backpack', status: 'DRAFT' })
  })

  /** The switch starts on, so the ordinary path still publishes. */
  it('creates an active listing by default', async () => {
    const bodies = captureCreateBodies()
    renderPage()
    await fillProduct({ price: '19.99', stockQty: '5' })

    expect(screen.getByRole('switch', { name: 'Active' })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Products page')).toBeInTheDocument()
    expect(bodies.at(-1)).toMatchObject({ status: 'ACTIVE' })
  })

  /** The same count the edit form shows, on the same field. */
  it('counts the characters in the title against the limit', async () => {
    renderPage()

    expect(screen.getByText('0/120 characters')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Title'), 'Trail Backpack')
    expect(screen.getByText('14/120 characters')).toBeInTheDocument()
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

/**
 * The POST body itself, since only the request says what the form sent; the
 * fixture's product list doesn't store a status. Falls through to the default
 * handler afterwards, so the create still behaves normally.
 */
function captureCreateBodies() {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post('http://localhost:8080/sellers/me/products', async ({ request }) => {
      bodies.push((await request.clone().json()) as Record<string, unknown>)
      return undefined
    }),
  )
  return bodies
}

/** Everything the form needs before Save, with the one variant's numbers varied. */
async function fillProduct({ price, stockQty }: { price: string; stockQty: string }) {
  await userEvent.type(screen.getByLabelText('Title'), 'Trail Backpack')
  await userEvent.click(screen.getByRole('combobox', { name: 'Category' }))
  await userEvent.type(screen.getByRole('combobox', { name: 'Search category' }), 'Outdoor')
  await userEvent.click(await screen.findByRole('option', { name: 'Outdoor' }))
  await userEvent.type(screen.getByLabelText('Variant 1 label'), 'Standard')
  await userEvent.type(screen.getByLabelText('Variant 1 SKU'), 'SKU-1')
  await userEvent.type(screen.getByLabelText('Variant 1 price'), price)
  await userEvent.type(screen.getByLabelText('Variant 1 stock quantity'), stockQty)
}
