import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SellerAddProduct } from '@/pages/seller/SellerAddProduct'
import { SellerProductDetail } from '@/pages/seller/SellerProductDetail'
import {
  TAKEN_SKU,
  findSellerProductDetail,
  resetSellerProductDetails,
  resetSellerProducts,
} from '@/test/msw/fixtures/sellerProducts'
import { server } from '@/test/msw/server'
import type { components } from '@/lib/api/schema'

type SellerImage = components['schemas']['SellerImage']

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111'
const CATEGORY = { slug: 'outdoor', name: 'Outdoor' }

function image(n: number): SellerImage {
  return {
    id: `img-${n}`,
    url: `https://mock-s3.local/stored/img-${n}`,
    position: n,
    status: 'STORED',
  }
}

function seed({ images = [] as SellerImage[] } = {}) {
  resetSellerProducts([
    {
      id: PRODUCT_ID,
      slug: 'trail-backpack',
      title: 'Trail Backpack',
      thumbnailUrl: null,
      category: CATEGORY,
      variantCount: 2,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ])
  resetSellerProductDetails([
    {
      id: PRODUCT_ID,
      slug: 'trail-backpack',
      title: 'Trail Backpack',
      brandName: 'Ridgeline',
      description: 'A pack for long days out.',
      category: CATEGORY,
      status: 'ACTIVE',
      variants: [
        { id: 'v-small', label: 'Small', sku: 'TB-S', price: 49.99, stockQty: 5 },
        { id: 'v-large', label: 'Large', sku: 'TB-L', price: 59.99, stockQty: 6 },
      ],
      images,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ])
}

/**
 * Every request the page makes, recorded in order. The single save is defined
 * by which endpoints it calls and which it leaves alone, and that is not
 * visible from the rendered output.
 */
interface Call {
  method: string
  path: string
  body?: Record<string, unknown>
}

let calls: Call[] = []

function listener({ request }: { request: Request }) {
  const call: Call = { method: request.method, path: new URL(request.url).pathname }
  calls.push(call)
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    void request
      .clone()
      .json()
      .then((body: Record<string, unknown>) => {
        call.body = body
      })
      .catch(() => {})
  }
}

function callsTo(method: string, pattern: RegExp) {
  return calls.filter((call) => call.method === method && pattern.test(call.path))
}

function renderEditPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/seller/products/${PRODUCT_ID}`]}>
        <Routes>
          <Route path="/seller/products" element={<p>Back on the list</p>} />
          <Route path="/seller/products/:productId" element={<SellerProductDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderAddPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/seller/products/new']}>
        <Routes>
          <Route path="/seller/products" element={<p>Back on the list</p>} />
          <Route path="/seller/products/new" element={<SellerAddProduct />} />
          <Route path="/seller/products/:productId" element={<SellerProductDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function loaded() {
  expect(await screen.findByDisplayValue('Trail Backpack')).toBeInTheDocument()
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save changes' })
}

beforeEach(() => {
  calls = []
  server.events.on('request:start', listener)
  // jsdom/vitest's URL.createObjectURL chokes on File internals - stub it, the
  // blob URL itself is never asserted on.
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  stubStoragePut()
  seed()
})

afterEach(() => {
  server.events.removeListener('request:start', listener)
  resetSellerProductDetails()
  vi.restoreAllMocks()
  storagePutStatus = () => 200
})

const STORAGE_PREFIX = 'https://mock-s3.local/upload/'

/** Per-test override, reset in afterEach. */
let storagePutStatus: () => number = () => 200

/**
 * Answers the presigned PUT without letting the File reach fetch. Not a choice
 * about coverage: vitest's jsdom Blob compat shim throws on any Blob or File
 * used as a fetch body in this environment, so the direct-to-storage step
 * cannot run here at all. Everything either side of it - presign, confirm, the
 * ordering write, and the per-file failure reporting - is the real code.
 */
function stubStoragePut() {
  const realFetch = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    if (url.startsWith(STORAGE_PREFIX)) {
      return Promise.resolve(new Response(null, { status: storagePutStatus() }))
    }
    return realFetch(input, init)
  })
}

describe('the product form', () => {
  it('lays the listing out in the design three cards', async () => {
    renderEditPage()
    await loaded()

    expect(screen.getByRole('heading', { name: 'Basics' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Images' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Variants' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Edit product' })).toBeInTheDocument()
    expect(screen.getByText('Trail Backpack · Outdoor')).toBeInTheDocument()
  })

  it('counts the characters in the title against the limit', async () => {
    renderEditPage()
    await loaded()

    expect(screen.getByText('14/120 characters')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Title'), '!')
    expect(screen.getByText('15/120 characters')).toBeInTheDocument()
  })

  it('closes the variants card with what the listing adds up to', async () => {
    renderEditPage()
    await loaded()

    expect(screen.getByText('2 variants · 11 in stock')).toBeInTheDocument()
    expect(screen.getByText('$49.99 – $59.99')).toBeInTheDocument()
    expect(screen.getByText('Price range')).toBeInTheDocument()
    expect(screen.getByText('Total stock')).toBeInTheDocument()
  })

  it('opens the status control on the status the listing is saved with', async () => {
    resetSellerProductDetails([{ ...findSellerProductDetail(PRODUCT_ID)!, status: 'DRAFT' }])
    renderEditPage()
    await loaded()

    expect(screen.getByRole('radio', { name: 'Draft' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Active' })).not.toBeChecked()
  })
})

describe('when the product form can be saved', () => {
  it('will not save a listing nothing has changed on', async () => {
    renderEditPage()
    await loaded()

    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('No changes yet')).toBeInTheDocument()
  })

  it('names what is still missing instead of only greying the button out', async () => {
    renderEditPage()
    await loaded()

    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.clear(screen.getByLabelText('Variant 1 price'))

    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Still needs a title, every variant field.')).toBeInTheDocument()
  })

  it('offers the save once the listing is complete and changed', async () => {
    renderEditPage()
    await loaded()

    await userEvent.type(screen.getByLabelText('Title'), ' II')

    expect(saveButton()).toBeEnabled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('goes back to the list without saving when cancelled', async () => {
    renderEditPage()
    await loaded()

    await userEvent.type(screen.getByLabelText('Title'), ' II')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Back on the list')).toBeInTheDocument()
    expect(callsTo('PATCH', /\/products\//)).toHaveLength(0)
  })
})

describe('the single save', () => {
  it('writes the product, an edited variant, a new one and a removed one from one button', async () => {
    renderEditPage()
    await loaded()

    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Trail Backpack 40L')

    await userEvent.clear(screen.getByLabelText('Variant 1 price'))
    await userEvent.type(screen.getByLabelText('Variant 1 price'), '54.5')

    await userEvent.click(screen.getByRole('button', { name: 'Add variant' }))
    await userEvent.type(screen.getByLabelText('Variant 3 label'), 'Huge')
    await userEvent.type(screen.getByLabelText('Variant 3 SKU'), 'TB-XL')
    await userEvent.type(screen.getByLabelText('Variant 3 price'), '69')
    await userEvent.type(screen.getByLabelText('Variant 3 stock quantity'), '2')

    await userEvent.click(screen.getByRole('button', { name: 'Remove variant 2' }))

    await userEvent.click(saveButton())

    expect(await screen.findByText('Back on the list')).toBeInTheDocument()

    const saved = findSellerProductDetail(PRODUCT_ID)!
    expect(saved.title).toBe('Trail Backpack 40L')
    expect(saved.variants.map((variant) => variant.sku)).toEqual(['TB-S', 'TB-XL'])
    expect(saved.variants[0].price).toBe(54.5)
    expect(saved.variants[1].stockQty).toBe(2)
  })

  it('sends only the product fields that changed', async () => {
    renderEditPage()
    await loaded()

    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Trail Backpack 40L')
    await userEvent.click(saveButton())

    expect(await screen.findByText('Back on the list')).toBeInTheDocument()

    const patches = callsTo('PATCH', new RegExp(`/products/${PRODUCT_ID}$`))
    expect(patches).toHaveLength(1)
    expect(patches[0].body).toEqual({ title: 'Trail Backpack 40L' })
  })

  it('leaves the variants alone when only the product changed', async () => {
    renderEditPage()
    await loaded()

    await userEvent.type(screen.getByLabelText(/^Brand/), ' Co')
    await userEvent.click(saveButton())

    expect(await screen.findByText('Back on the list')).toBeInTheDocument()
    expect(callsTo('PATCH', /\/variants\//)).toHaveLength(0)
    expect(callsTo('POST', /\/variants$/)).toHaveLength(0)
  })

  it('publishes a draft from the same button, with the status it was switched to', async () => {
    renderEditPage()
    await loaded()

    await userEvent.click(screen.getByRole('radio', { name: 'Draft' }))
    await userEvent.click(saveButton())

    expect(await screen.findByText('Back on the list')).toBeInTheDocument()
    expect(findSellerProductDetail(PRODUCT_ID)!.status).toBe('DRAFT')
  })
})

describe('the single save, for images', () => {
  it('removes an image and writes the remaining order, but not before Save', async () => {
    seed({ images: [image(0), image(1), image(2)] })
    renderEditPage()
    await loaded()

    await userEvent.click(screen.getByRole('button', { name: 'Remove image 2' }))
    expect(callsTo('DELETE', /\/images\//)).toHaveLength(0)

    await userEvent.click(saveButton())
    expect(await screen.findByText('Back on the list')).toBeInTheDocument()

    expect(callsTo('DELETE', /\/images\/img-1$/)).toHaveLength(1)
    expect(findSellerProductDetail(PRODUCT_ID)!.images.map((i) => i.id)).toEqual(['img-0', 'img-2'])
  })

  it('reorders the gallery in one write, with the first image as the cover', async () => {
    seed({ images: [image(0), image(1), image(2)] })
    renderEditPage()
    await loaded()

    await userEvent.click(screen.getByRole('button', { name: 'Move image 1 later' }))
    await userEvent.click(saveButton())
    expect(await screen.findByText('Back on the list')).toBeInTheDocument()

    const orderWrites = callsTo('PUT', /\/images\/order$/)
    expect(orderWrites).toHaveLength(1)
    expect(orderWrites[0].body).toEqual({ imageIds: ['img-1', 'img-0', 'img-2'] })
    expect(findSellerProductDetail(PRODUCT_ID)!.images.map((i) => i.position)).toEqual([0, 1, 2])
  })

  it('cannot move the first image earlier or the last one later', async () => {
    seed({ images: [image(0), image(1)] })
    renderEditPage()
    await loaded()

    expect(screen.getByRole('button', { name: 'Move image 1 earlier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move image 2 later' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move image 1 later' })).toBeEnabled()
  })

  it('adds images from the tile inside the card, and uploads them on Save', async () => {
    renderEditPage()
    await loaded()

    // The dashed tile is the control; the input behind it is not in the layout.
    expect(screen.getByRole('button', { name: 'Add image' })).toBeInTheDocument()

    await userEvent.upload(
      screen.getByLabelText('Add images', { selector: 'input' }),
      new File(['a'], 'front.png', { type: 'image/png' }),
    )
    expect(screen.getByText('Cover')).toBeInTheDocument()
    expect(callsTo('POST', /upload-url$/)).toHaveLength(0)

    await userEvent.click(saveButton())
    expect(await screen.findByText('Back on the list')).toBeInTheDocument()

    expect(callsTo('POST', /upload-url$/)).toHaveLength(1)
    expect(callsTo('POST', /images\/confirm$/)).toHaveLength(1)
    expect(findSellerProductDetail(PRODUCT_ID)!.images).toHaveLength(1)
  })

  it('stops offering the tile at the image cap', async () => {
    seed({ images: [0, 1, 2, 3, 4, 5, 6].map(image) })
    renderEditPage()
    await loaded()

    expect(screen.queryByRole('button', { name: 'Add image' })).not.toBeInTheDocument()
    expect(screen.getAllByText('7/7').length).toBeGreaterThan(0)
  })

  it('says how many files it left out rather than failing them one at a time', async () => {
    seed({ images: [0, 1, 2, 3, 4, 5].map(image) })
    renderEditPage()
    await loaded()

    await userEvent.upload(screen.getByLabelText('Add images', { selector: 'input' }), [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new File(['c'], 'c.png', { type: 'image/png' }),
    ])

    expect(
      screen.getByText('2 files were left out — a product holds at most 7 images.'),
    ).toBeInTheDocument()
  })
})

describe('when part of a save fails', () => {
  it('saves the parts that can be saved and names the part that could not', async () => {
    server.use(
      http.patch(`http://localhost:8080/products/${PRODUCT_ID}`, () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/validation-error',
            title: 'Unprocessable Entity',
            status: 422,
            errors: [{ field: 'title', reason: 'must not contain a slash' }],
          },
          { status: 422 },
        ),
      ),
    )
    renderEditPage()
    await loaded()

    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Trail/Backpack')
    await userEvent.clear(screen.getByLabelText('Variant 1 stock quantity'))
    await userEvent.type(screen.getByLabelText('Variant 1 stock quantity'), '12')

    await userEvent.click(saveButton())

    // The variant landed even though the product's own fields did not.
    await waitFor(() => expect(findSellerProductDetail(PRODUCT_ID)!.variants[0].stockQty).toBe(12))
    expect(findSellerProductDetail(PRODUCT_ID)!.title).toBe('Trail Backpack')

    // And the page said so, on the field the API named, without leaving.
    expect(screen.getByText('Title must not contain a slash.')).toBeInTheDocument()
    expect(screen.getByText(/Product details: check the highlighted fields/)).toBeInTheDocument()
    expect(screen.queryByText('Back on the list')).not.toBeInTheDocument()
  })

  it('leaves only the failed half of the listing outstanding', async () => {
    server.use(
      http.patch(`http://localhost:8080/products/${PRODUCT_ID}`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Server Error', status: 500, detail: 'Try again later.' },
          { status: 500 },
        ),
      ),
    )
    renderEditPage()
    await loaded()

    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Trail Backpack 40L')
    await userEvent.clear(screen.getByLabelText('Variant 1 stock quantity'))
    await userEvent.type(screen.getByLabelText('Variant 1 stock quantity'), '12')
    await userEvent.click(saveButton())

    await screen.findByText(/Product details: Try again later\./)

    // The stock matches the server now, so the only unsaved thing left is the
    // title - and Save is still there to try it again.
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    expect(screen.getByLabelText('Variant 1 stock quantity')).toHaveValue(12)
  })

  it('does not add the new variant twice when the save is retried', async () => {
    server.use(
      http.patch(`http://localhost:8080/products/${PRODUCT_ID}`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Server Error', status: 500, detail: 'Try again later.' },
          { status: 500 },
        ),
      ),
    )
    renderEditPage()
    await loaded()

    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Trail Backpack 40L')
    await userEvent.click(screen.getByRole('button', { name: 'Add variant' }))
    await userEvent.type(screen.getByLabelText('Variant 3 label'), 'Huge')
    await userEvent.type(screen.getByLabelText('Variant 3 SKU'), 'TB-XL')
    await userEvent.type(screen.getByLabelText('Variant 3 price'), '69')
    await userEvent.type(screen.getByLabelText('Variant 3 stock quantity'), '2')

    await userEvent.click(saveButton())
    await screen.findByText(/Product details: Try again later\./)
    expect(findSellerProductDetail(PRODUCT_ID)!.variants).toHaveLength(3)

    await userEvent.click(saveButton())
    await waitFor(() => expect(callsTo('PATCH', new RegExp(`/products/${PRODUCT_ID}$`))).toHaveLength(2))

    expect(callsTo('POST', /\/variants$/)).toHaveLength(1)
    expect(findSellerProductDetail(PRODUCT_ID)!.variants).toHaveLength(3)
  })

  it('does not write an image ordering the API would refuse when a removal failed', async () => {
    seed({ images: [image(0), image(1), image(2)] })
    server.use(
      http.delete('http://localhost:8080/images/:imageId', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Server Error', status: 500, detail: 'Storage is down.' },
          { status: 500 },
        ),
      ),
    )
    renderEditPage()
    await loaded()

    await userEvent.click(screen.getByRole('button', { name: 'Remove image 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move image 1 later' }))
    await userEvent.click(saveButton())

    await screen.findByText(/Removing an image: Storage is down\./)
    expect(callsTo('PUT', /\/images\/order$/)).toHaveLength(0)
  })
})

describe('when the API refuses a field', () => {
  it('puts a variant validation failure on that row', async () => {
    server.use(
      http.patch('http://localhost:8080/variants/:variantId', () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/validation-error',
            title: 'Unprocessable Entity',
            status: 422,
            errors: [{ field: 'price', reason: 'must be at least 1.00' }],
          },
          { status: 422 },
        ),
      ),
    )
    renderEditPage()
    await loaded()

    await userEvent.clear(screen.getByLabelText('Variant 2 price'))
    await userEvent.type(screen.getByLabelText('Variant 2 price'), '0.5')
    await userEvent.click(saveButton())

    const message = await screen.findByText('Price must be at least 1.00.')
    expect(message).toBeInTheDocument()
    expect(screen.getByLabelText('Variant 2 price')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Variant 1 price')).toHaveAttribute('aria-invalid', 'false')
  })

  it('puts a SKU already in use on the row that tried to take it', async () => {
    renderEditPage()
    await loaded()

    await userEvent.clear(screen.getByLabelText('Variant 1 SKU'))
    await userEvent.type(screen.getByLabelText('Variant 1 SKU'), TAKEN_SKU)
    await userEvent.click(saveButton())

    expect(
      await screen.findByText(`SKU ${TAKEN_SKU} belongs to another variant`),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Variant 1 SKU')).toHaveAttribute('aria-invalid', 'true')
  })

  it('never shows a bare "validation failed" for something it can place', async () => {
    server.use(
      http.patch(`http://localhost:8080/products/${PRODUCT_ID}`, () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/validation-error',
            title: 'Validation failed',
            status: 422,
            detail: 'Validation failed',
            errors: [{ field: 'brandName', reason: 'must be at most 60 characters' }],
          },
          { status: 422 },
        ),
      ),
    )
    renderEditPage()
    await loaded()

    await userEvent.type(screen.getByLabelText(/^Brand/), ' Outfitters')
    await userEvent.click(saveButton())

    expect(await screen.findByText('Brand must be at most 60 characters.')).toBeInTheDocument()
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument()
  })
})

describe('the variant rows', () => {
  it('will not let the last variant be removed', async () => {
    resetSellerProductDetails([
      {
        ...findSellerProductDetail(PRODUCT_ID)!,
        variants: [{ id: 'v-small', label: 'Small', sku: 'TB-S', price: 49.99, stockQty: 5 }],
      },
    ])
    renderEditPage()
    await loaded()

    expect(screen.getByRole('button', { name: 'Remove variant 1' })).toBeDisabled()
  })

  it('duplicates a row as it reads now, with -COPY on the SKU and no id of its own', async () => {
    renderEditPage()
    await loaded()

    await userEvent.clear(screen.getByLabelText('Variant 1 price'))
    await userEvent.type(screen.getByLabelText('Variant 1 price'), '44')
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate variant 1' }))

    expect(screen.getByLabelText('Variant 2 SKU')).toHaveValue('TB-S-COPY')
    expect(screen.getByLabelText('Variant 2 price')).toHaveValue(44)

    await userEvent.click(saveButton())
    expect(await screen.findByText('Back on the list')).toBeInTheDocument()

    // The API has no ordering for variants, so a new row lands at the end of
    // the saved list whatever position it was typed into.
    expect(findSellerProductDetail(PRODUCT_ID)!.variants.map((v) => v.sku).sort()).toEqual([
      'TB-L',
      'TB-S',
      'TB-S-COPY',
    ])
  })
})

describe('the add form', () => {
  it('publishes a new listing from the footer button', async () => {
    renderAddPage()

    await userEvent.type(await screen.findByLabelText('Title'), 'Summit Bottle')
    await userEvent.click(screen.getByRole('combobox', { name: /category/i }))
    await userEvent.click(await screen.findByRole('option', { name: 'Outdoor' }))
    await userEvent.type(screen.getByLabelText('Variant 1 label'), 'One size')
    await userEvent.type(screen.getByLabelText('Variant 1 SKU'), 'SB-1')
    await userEvent.type(screen.getByLabelText('Variant 1 price'), '24')
    await userEvent.type(screen.getByLabelText('Variant 1 stock quantity'), '30')

    const publish = screen.getByRole('button', { name: 'Publish product' })
    expect(publish).toBeEnabled()
    await userEvent.click(publish)

    expect(await screen.findByText('Back on the list')).toBeInTheDocument()
    const created = callsTo('POST', /\/sellers\/me\/products$/)
    expect(created).toHaveLength(1)
    expect(created[0].body).toMatchObject({
      title: 'Summit Bottle',
      categorySlug: 'outdoor',
      status: 'ACTIVE',
      variants: [{ label: 'One size', sku: 'SB-1', price: 24, stockQty: 30 }],
    })
  })

  it('will not publish until the listing is complete', async () => {
    renderAddPage()

    expect(await screen.findByRole('button', { name: 'Publish product' })).toBeDisabled()
    expect(
      screen.getByText('Still needs a title, a category, every variant field.'),
    ).toBeInTheDocument()
  })

  it('puts a refused field on that field rather than on the button', async () => {
    server.use(
      http.post('http://localhost:8080/sellers/me/products', () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/validation-error',
            title: 'Unprocessable Entity',
            status: 422,
            errors: [{ field: 'variants[0].sku', reason: 'is already used by another listing' }],
          },
          { status: 422 },
        ),
      ),
    )
    renderAddPage()

    await userEvent.type(await screen.findByLabelText('Title'), 'Summit Bottle')
    await userEvent.click(screen.getByRole('combobox', { name: /category/i }))
    await userEvent.click(await screen.findByRole('option', { name: 'Outdoor' }))
    await userEvent.type(screen.getByLabelText('Variant 1 label'), 'One size')
    await userEvent.type(screen.getByLabelText('Variant 1 SKU'), 'SB-1')
    await userEvent.type(screen.getByLabelText('Variant 1 price'), '24')
    await userEvent.type(screen.getByLabelText('Variant 1 stock quantity'), '30')
    await userEvent.click(screen.getByRole('button', { name: 'Publish product' }))

    expect(await screen.findByText('SKU is already used by another listing.')).toBeInTheDocument()
    expect(screen.queryByText('Back on the list')).not.toBeInTheDocument()
  })

  it('sends a listing whose pictures did not upload to its own page, saying which', async () => {
    storagePutStatus = () => 500
    renderAddPage()

    await userEvent.type(await screen.findByLabelText('Title'), 'Summit Bottle')
    await userEvent.click(screen.getByRole('combobox', { name: /category/i }))
    await userEvent.click(await screen.findByRole('option', { name: 'Outdoor' }))
    await userEvent.type(screen.getByLabelText('Variant 1 label'), 'One size')
    await userEvent.type(screen.getByLabelText('Variant 1 SKU'), 'SB-1')
    await userEvent.type(screen.getByLabelText('Variant 1 price'), '24')
    await userEvent.type(screen.getByLabelText('Variant 1 stock quantity'), '30')
    await userEvent.upload(
      screen.getByLabelText('Add images', { selector: 'input' }),
      new File(['a'], 'front.png', { type: 'image/png' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Publish product' }))

    // The listing exists, so the seller lands on its own page - carrying what
    // did not make it, rather than dropping the news in the navigation.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Edit product' }),
    ).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/front\.png didn't upload/)).toBeInTheDocument()
  })
})
