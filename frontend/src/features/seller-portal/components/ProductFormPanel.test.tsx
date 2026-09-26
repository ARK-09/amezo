import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/test/msw/server'

import { sellerProductKeys } from '@/features/seller-portal/api/useSellerProducts'

import {
  findSellerProductDetail,
  listSellerProductRows,
  resetSellerProductDetails,
  resetSellerProducts,
  TAKEN_SKU,
} from '@/test/msw/fixtures/sellerProducts'


import { SellerProductDetail } from '@/pages/seller/SellerProductDetail'

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111'

function renderPage(productId = PRODUCT_ID) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    // Handed back so a test can trigger the background refetch a window refocus
    // would; there is no other way to reach the client the page renders against.
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/seller/products/${productId}`]}>
          <Routes>
            <Route path="/seller/products/:productId" element={<SellerProductDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

describe('SellerProductDetail', () => {
  beforeEach(() => {
    resetSellerProducts([
      {
        id: PRODUCT_ID,
        title: 'Trail Backpack',
        slug: 'trail-backpack',
        thumbnailUrl: null,
        category: { slug: 'outdoor', name: 'Outdoor' },
        variantCount: 2,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    resetSellerProductDetails()
  })

  it('shows the product fields and every variant with its stock', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('Trail Backpack')).toBeInTheDocument()
    // A combobox showing the category's name, not a text field holding it.
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Outdoor')

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
    expect(findSellerProductDetail(PRODUCT_ID)!.category.slug).toBe('outdoor')
  })

  /**
   * A refetch - window refocus, or an invalidation from somewhere else on the page
   * - hands back a new object for the same product. Seeding off that object rather
   * than off its identity replaced a half-typed title with the server's old one.
   */
  it('keeps unsaved edits through a background refetch', async () => {
    const { queryClient } = renderPage()
    const title = await screen.findByDisplayValue('Trail Backpack')
    const detail = findSellerProductDetail(PRODUCT_ID)!
    const price = screen.getByLabelText(`Price for ${detail.variants[0].sku}`)

    await userEvent.clear(title)
    await userEvent.type(title, 'Trail Backpack 40')
    await userEvent.clear(price)
    await userEvent.type(price, '59.9')

    // The product moved on the server while the seller typed - another tab, another
    // device - so the refetch brings back a genuinely new object rather than the
    // identical one react-query's structural sharing would hand straight back.
    detail.variants[0].stockQty += 3
    detail.images = [
      { id: 'image-1', url: 'https://cdn.example/1.jpg', position: 0, status: 'STORED' },
    ]
    void queryClient.refetchQueries({ queryKey: sellerProductKeys.detail(PRODUCT_ID) })
    // The gallery is what shows the new data reached the form at all: every field
    // above it is seeded state, which is precisely what must not move.
    expect(await screen.findByRole('button', { name: 'Remove image 1' })).toBeInTheDocument()

    expect(title).toHaveValue('Trail Backpack 40')
    // The variant rows seed the same way, and lost edits the same way.
    expect(price).toHaveValue(59.9)
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

  /** Number('') is 0, so clearing the price used to save the variant at $0.00. */
  it('refuses a cleared price instead of saving it as zero', async () => {
    renderPage()
    const detail = findSellerProductDetail(PRODUCT_ID)!
    const priceBefore = detail.variants[0].price
    const price = await screen.findByLabelText(`Price for ${detail.variants[0].sku}`)

    await userEvent.clear(price)
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a price above 0')
    expect(findSellerProductDetail(PRODUCT_ID)!.variants[0].price).toBe(priceBefore)
  })

  /** A typed 0 is the same mispriced listing, so it is refused the same way. */
  it('refuses a price of zero', async () => {
    renderPage()
    const detail = findSellerProductDetail(PRODUCT_ID)!
    const priceBefore = detail.variants[0].price
    const price = await screen.findByLabelText(`Price for ${detail.variants[0].sku}`)

    await userEvent.clear(price)
    await userEvent.type(price, '0')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a price above 0')
    expect(findSellerProductDetail(PRODUCT_ID)!.variants[0].price).toBe(priceBefore)
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
        slug: 'single-variant',
        thumbnailUrl: null,
        category: { slug: 'outdoor', name: 'Outdoor' },
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
    detail.images = storedImages(7)
    renderPage()

    expect(await screen.findByRole('button', { name: /Add image/ })).toBeDisabled()
    expect(screen.getByText('Remove one to add another')).toBeInTheDocument()
  })

  /**
   * Unpublishing. Until this switch existed nothing in the app could set a status
   * at all, so a listing could only ever be live or deleted.
   */
  it('takes a product to draft and back, sending only the status', async () => {
    const patches = capturePatchBodies()
    renderPage()

    const toggle = await screen.findByRole('switch', { name: 'Active' })
    expect(toggle).toBeChecked()

    await userEvent.click(toggle)
    expect(screen.getByText(/hidden from shoppers until you activate it/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.status).toBe('DRAFT')
    })
    // Only what changed: the PATCH must not carry the title along with it.
    expect(patches.at(-1)).toEqual({ status: 'DRAFT' })
    expect(screen.getByRole('switch', { name: 'Active' })).not.toBeChecked()
    // Where the seller sees the result of this: their own catalogue row.
    expect(listSellerProductRows()[0].status).toBe('DRAFT')

    await userEvent.click(screen.getByRole('switch', { name: 'Active' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.status).toBe('ACTIVE')
    })
    expect(patches.at(-1)).toEqual({ status: 'ACTIVE' })
    expect(listSellerProductRows()[0].status).toBe('ACTIVE')
  })

  /** A product already stored as a draft has to open as one. */
  it('opens a draft product with the switch off', async () => {
    findSellerProductDetail(PRODUCT_ID)!.status = 'DRAFT'
    renderPage()

    expect(await screen.findByRole('switch', { name: 'Active' })).not.toBeChecked()
  })

  it('counts the characters in the title against the limit', async () => {
    renderPage()
    const title = await screen.findByDisplayValue('Trail Backpack')

    expect(screen.getByText('14/120 characters')).toBeInTheDocument()
    await userEvent.type(title, ' 40L')
    expect(screen.getByText('18/120 characters')).toBeInTheDocument()
  })

  /** Which image buyers see in search, said rather than left to be counted out. */
  it('marks the first image as the cover', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = storedImages(3)
    renderPage()

    const first = (await screen.findByRole('button', { name: 'Remove image 1' })).closest('li')!
    expect(within(first).getByText('Cover')).toBeInTheDocument()
    expect(screen.getAllByText('Cover')).toHaveLength(1)
  })

  it('duplicates a variant with -COPY on the SKU', async () => {
    renderPage()
    const source = findSellerProductDetail(PRODUCT_ID)!.variants[0]

    await userEvent.click(await screen.findByRole('button', { name: `Duplicate ${source.sku}` }))

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.variants).toHaveLength(3)
    })
    // The copy carries the row's numbers, and its SKU is the one field that
    // cannot be shared - so it arrives suffixed, ready to be edited.
    expect(findSellerProductDetail(PRODUCT_ID)!.variants.at(-1)).toMatchObject({
      label: source.label,
      sku: `${source.sku}-COPY`,
      price: source.price,
      stockQty: source.stockQty,
    })
    expect(await screen.findByDisplayValue(`${source.sku}-COPY`)).toBeInTheDocument()
  })

  /** A typed price the API would refuse is refused here rather than copied. */
  it('refuses to duplicate a variant whose price has been cleared', async () => {
    renderPage()
    const source = findSellerProductDetail(PRODUCT_ID)!.variants[0]

    await userEvent.clear(await screen.findByLabelText(`Price for ${source.sku}`))
    await userEvent.click(screen.getByRole('button', { name: `Duplicate ${source.sku}` }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a price above 0')
    expect(findSellerProductDetail(PRODUCT_ID)!.variants).toHaveLength(2)
  })

  it('closes the variants section with the listing totals', async () => {
    renderPage()

    expect(await screen.findByText('Price range')).toBeInTheDocument()
    // The two seeded variants: $49.99/5 and $59.99/6.
    expect(screen.getByText('$49.99 – $59.99')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('0/7')).toBeInTheDocument()
  })
})

/**
 * The PATCH body itself, since only the request says which fields a save carried -
 * the fixture store shows the result either way. Falls through to the default
 * handler afterwards, so the save still behaves normally.
 */
function capturePatchBodies() {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.patch('http://localhost:8080/products/:productId', async ({ request }) => {
      bodies.push((await request.clone().json()) as Record<string, unknown>)
      return undefined
    }),
  )
  return bodies
}

/**
 * Editing a product is where a seller with a phone full of photos actually adds
 * them, so the picker takes a whole selection at once rather than one file per
 * trip through the file dialog.
 */
describe('SellerProductDetail images', () => {
  beforeEach(() => {
    resetSellerProducts([
      {
        id: PRODUCT_ID,
        title: 'Trail Backpack',
        slug: 'trail-backpack',
        thumbnailUrl: null,
        category: { slug: 'outdoor', name: 'Outdoor' },
        variantCount: 2,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    resetSellerProductDetails()
    stubStoragePut()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    storagePutStatus = () => 200
  })

  it('uploads every file in one selection', async () => {
    renderPage()
    const input = await screen.findByLabelText('Add images')

    await userEvent.upload(input, [
      fakeImage('front.jpg'),
      fakeImage('back.jpg'),
      fakeImage('detail.jpg'),
    ])

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.images).toHaveLength(3)
    })
    const images = findSellerProductDetail(PRODUCT_ID)!.images
    // All the way through the three-step flow, not left PENDING at the presign.
    expect(images.every((i) => i.status === 'STORED')).toBe(true)
    expect(await screen.findByRole('button', { name: 'Remove image 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove image 3' })).toBeInTheDocument()
  })

  it('accepts a multiple selection at all', async () => {
    renderPage()
    expect(await screen.findByLabelText('Add images')).toHaveAttribute('multiple')
  })

  /** New files go after the existing ones, so the thumbnail buyers see is stable. */
  it('positions new images after the ones already there', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = storedImages(2)
    renderPage()

    await userEvent.upload(await screen.findByLabelText('Add images'), [
      fakeImage('third.jpg'),
      fakeImage('fourth.jpg'),
    ])

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.images).toHaveLength(4)
    })
    expect(findSellerProductDetail(PRODUCT_ID)!.images.map((i) => i.position)).toEqual([0, 1, 2, 3])
  })

  it('shows how many slots are left', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = storedImages(5)
    renderPage()

    expect(await screen.findByText('2 slots left')).toBeInTheDocument()
  })

  /**
   * Picking more than fits: the ones that fit are uploaded and the seller is told
   * the rest were left out, rather than each extra file presigning its way to a
   * separate 409.
   */
  it('takes only as many as fit and says so', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = storedImages(5)
    renderPage()

    await userEvent.upload(await screen.findByLabelText('Add images'), [
      fakeImage('a.jpg'),
      fakeImage('b.jpg'),
      fakeImage('c.jpg'),
      fakeImage('d.jpg'),
    ])

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.images).toHaveLength(7)
    })
    expect(await screen.findByText(/2 files were left out/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add image/ })).toBeDisabled()
  })

  /**
   * A half-successful batch is the interesting failure: one bad file must not cost
   * the seller the other two, and they need to know which one to replace.
   */
  it('keeps the files that uploaded and names the one that did not', async () => {
    let call = 0
    server.use(
      http.post('http://localhost:8080/products/:productId/images/upload-url', () => {
        call++
        if (call === 2) {
          return HttpResponse.json(
            {
              type: 'https://api/errors/payload-too-large',
              title: 'Payload Too Large',
              status: 413,
              detail: 'That image is larger than the 10 MB limit',
            },
            { status: 413 },
          )
        }
        return undefined // fall through to the default handler
      }),
    )
    renderPage()

    await userEvent.upload(await screen.findByLabelText('Add images'), [
      fakeImage('good-1.jpg'),
      fakeImage('enormous.jpg'),
      fakeImage('good-2.jpg'),
    ])

    const alert = await screen.findByText(/1 of 3 images didn't upload/)
    expect(alert).toBeInTheDocument()
    expect(screen.getByText(/enormous\.jpg/)).toHaveTextContent('larger than the 10 MB limit')
    // The other two still landed, and their positions are contiguous - the failed
    // file doesn't leave a hole.
    const images = findSellerProductDetail(PRODUCT_ID)!.images
    expect(images).toHaveLength(2)
    expect(images.map((i) => i.position)).toEqual([0, 1])
  })

  /**
   * The upload can also fail at the bucket rather than at the API - a presigned
   * URL that expired, or storage refusing the object. That is a plain Error, not a
   * ProblemDetail, and still has to name the file.
   */
  it('reports a file the storage bucket rejects', async () => {
    let put = 0
    storagePutStatus = () => (++put === 1 ? 403 : 200)

    renderPage()
    await userEvent.upload(await screen.findByLabelText('Add images'), [
      fakeImage('expired.jpg'),
      fakeImage('fine.jpg'),
    ])

    expect(await screen.findByText(/1 of 2 images didn't upload/)).toBeInTheDocument()
    expect(screen.getByText(/expired\.jpg/)).toHaveTextContent('403')
  })

  /**
   * Editing is the only place an order can be fixed after the fact, and unlike
   * the create form nothing here is staged: the new order has to reach the API.
   */
  it('moves an image later and sends the whole ordering', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = storedImages(3)
    const [first, second] = detail.images.map((image) => image.id)
    const orders = captureOrderBodies()
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Move image 1 later' }))

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.images.map((i) => i.id)[0]).toBe(second)
    })
    // The whole list, not just the pair that moved - the endpoint renumbers from
    // what it is given, so anything left out would be dropped.
    expect(orders.at(-1)).toEqual([second, first, 'image-2'])
    expect(findSellerProductDetail(PRODUCT_ID)!.images.map((i) => i.position)).toEqual([0, 1, 2])
  })

  /** The cover is the first image, so it follows a reorder rather than sticking. */
  it('moves the cover badge with the image that becomes first', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = storedImages(2)
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Move image 2 earlier' }))

    await waitFor(() => {
      expect(findSellerProductDetail(PRODUCT_ID)!.images[0].id).toBe('image-1')
    })
    const cover = (await screen.findByText('Cover')).closest('li')!
    // Queried directly: the thumbnails carry an empty alt, so they are decorative
    // and have no img role to find them by.
    expect(cover.querySelector('img')).toHaveAttribute('src', 'https://cdn.example/1.jpg')
    expect(screen.getAllByText('Cover')).toHaveLength(1)
  })

  it('cannot move the first image earlier or the last one later', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = storedImages(2)
    renderPage()

    expect(await screen.findByRole('button', { name: 'Move image 1 earlier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move image 2 later' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move image 1 later' })).toBeEnabled()
  })

  it('surfaces a refused reorder instead of leaving the gallery rearranged', async () => {
    const detail = findSellerProductDetail(PRODUCT_ID)!
    detail.images = storedImages(2)
    server.use(
      http.put('http://localhost:8080/api/v1/products/:productId/images/order', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Unprocessable Entity',
            status: 422,
            detail: 'The list must name every image of this product exactly once.',
            errors: [{ field: 'imageIds', reason: 'must name every image exactly once' }],
          },
          { status: 422 },
        ),
      ),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Move image 1 later' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('must name every image')
    expect(findSellerProductDetail(PRODUCT_ID)!.images.map((i) => i.id)).toEqual([
      'image-0',
      'image-1',
    ])
  })

  it('reports a whole batch that fails', async () => {
    server.use(
      http.post('http://localhost:8080/products/:productId/images/upload-url', () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/storage-unavailable',
            title: 'Service Unavailable',
            status: 503,
            detail: 'Image storage is not configured',
          },
          { status: 503 },
        ),
      ),
    )
    renderPage()

    await userEvent.upload(await screen.findByLabelText('Add images'), [
      fakeImage('a.jpg'),
      fakeImage('b.jpg'),
    ])

    expect(await screen.findByText(/2 of 2 images didn't upload/)).toBeInTheDocument()
    expect(findSellerProductDetail(PRODUCT_ID)!.images).toHaveLength(0)
  })
})

/** The ordering the form PUT, which is the only place the whole list shows up. */
function captureOrderBodies() {
  const orders: string[][] = []
  server.use(
    http.put(
      'http://localhost:8080/api/v1/products/:productId/images/order',
      async ({ request }) => {
        const { imageIds } = (await request.clone().json()) as { imageIds: string[] }
        orders.push(imageIds)
        return undefined
      },
    ),
  )
  return orders
}

function fakeImage(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' })
}

const STORAGE_PREFIX = 'https://mock-s3.local/upload/'

/** Per-test override, reset in afterEach. */
let storagePutStatus: (url: string) => number = () => 200

/**
 * Answers the presigned PUT without letting the File reach fetch. Not a choice
 * about coverage: vitest's jsdom Blob compat shim throws on any Blob or File used
 * as a fetch body in this environment, so the direct-to-storage step cannot run
 * here at all. Everything either side of it - presign, confirm, the batching,
 * positions, the cap, and the per-file failure reporting - is the real code.
 */
function stubStoragePut() {
  const realFetch = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    if (url.startsWith(STORAGE_PREFIX)) {
      const status = storagePutStatus(url)
      return Promise.resolve(new Response(null, { status }))
    }
    return realFetch(input, init)
  })
}

function storedImages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `image-${i}`,
    url: `https://cdn.example/${i}.jpg`,
    position: i,
    status: 'STORED' as const,
  }))
}
