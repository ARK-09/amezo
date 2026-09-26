import type { components } from '@/lib/api/schema'

import { categoryBySlug } from './categories'

type SellerProductSummary = components['schemas']['SellerProductSummary']
type SellerProductDetail = components['schemas']['SellerProductDetail']
type SellerVariant = components['schemas']['SellerVariant']

// Demo-account starting catalog (browser/dev only - every test resets this
// to [] via resetSellerProducts() in beforeEach/afterEach). Same 5 of the 6
// products from fixtures/products.ts, so the seller portal and the buyer
// catalog show the same items instead of two unrelated demo datasets.
const DEMO_SEED: SellerProductSummary[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'wireless-noise-cancelling-headphones',
    title: 'Wireless Noise-Cancelling Headphones',
    thumbnailUrl: null,
    category: categoryBySlug('electronics'),
    variantCount: 2,
    createdAt: '2026-09-20T09:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    slug: '14-ultrabook-laptop-16gb-ram',
    title: '14" Ultrabook Laptop, 16GB RAM',
    thumbnailUrl: null,
    category: categoryBySlug('electronics'),
    variantCount: 1,
    createdAt: '2026-09-19T09:00:00.000Z',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    slug: 'ceramic-non-stick-cookware-set-10-piece',
    title: 'Ceramic Non-Stick Cookware Set (10-piece)',
    thumbnailUrl: null,
    category: categoryBySlug('kitchen'),
    variantCount: 1,
    createdAt: '2026-09-18T09:00:00.000Z',
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    slug: 'mechanical-keyboard-hot-swappable',
    title: 'Mechanical Keyboard, Hot-Swappable',
    thumbnailUrl: null,
    category: categoryBySlug('electronics'),
    variantCount: 2,
    createdAt: '2026-09-17T09:00:00.000Z',
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    slug: 'stainless-steel-water-bottle-32oz',
    title: 'Stainless Steel Water Bottle, 32oz',
    thumbnailUrl: null,
    category: categoryBySlug('outdoor'),
    variantCount: 1,
    createdAt: '2026-09-16T09:00:00.000Z',
  },
]

let products: SellerProductSummary[] = [...DEMO_SEED]

export function resetSellerProducts(seed: SellerProductSummary[] = []) {
  products = [...seed]
}

export function listSellerProducts(): SellerProductSummary[] {
  return products
}

export function addSellerProduct(product: SellerProductSummary) {
  products = [product, ...products]
}

export function removeSellerProduct(id: string) {
  products = products.filter((p) => p.id !== id)
}

/** The SKU the variant PATCH handler always rejects, so the 409 path is testable. */
export const TAKEN_SKU = 'ALREADY-TAKEN'

function detailFor(summary: SellerProductSummary): SellerProductDetail {
  return {
    id: summary.id,
    slug: summary.slug,
    title: summary.title,
    brandName: 'Demo Brand',
    description: 'Demo description.',
    category: summary.category,
    variants: Array.from({ length: summary.variantCount }, (_, i) => ({
      id: `${summary.id.slice(0, 8)}-variant-${i}`,
      label: i === 0 ? 'Default' : `Option ${i + 1}`,
      sku: `${summary.id.slice(0, 4).toUpperCase()}-${i}`,
      price: 49.99 + i * 10,
      stockQty: 5 + i,
    })),
    images: [],
    // The drawer's meta footer prints both. updatedAt starts equal to
    // createdAt - a product nobody has edited was last changed when it was made.
    createdAt: summary.createdAt,
    updatedAt: summary.createdAt,
  }
}

let details: Record<string, SellerProductDetail> = {}

export function resetSellerProductDetails(seed: SellerProductDetail[] = []) {
  details = {}
  for (const detail of seed) {
    details[detail.id] = structuredClone(detail)
  }
}

/**
 * Derived from the summary on first read rather than kept as a second hand-written
 * dataset - one place to add a product, and the detail can't drift from the row
 * the list shows.
 */
export function findSellerProductDetail(id: string): SellerProductDetail | undefined {
  if (details[id]) {
    return details[id]
  }
  const summary = products.find((p) => p.id === id)
  if (!summary) {
    return undefined
  }
  details[id] = detailFor(summary)
  return details[id]
}

export function updateSellerProductDetail(
  id: string,
  patch: Partial<SellerProductDetail>,
): SellerProductDetail | undefined {
  const current = findSellerProductDetail(id)
  if (!current) {
    return undefined
  }
  details[id] = { ...current, ...patch }
  // Keep the list row honest about the fields it shares with the detail.
  products = products.map((p) =>
    p.id === id
      ? { ...p, title: details[id].title, category: details[id].category }
      : p,
  )
  return details[id]
}

export function updateSellerVariant(
  variantId: string,
  patch: Partial<SellerVariant>,
): SellerVariant | undefined {
  for (const id of Object.keys(details)) {
    const variant = details[id].variants.find((v) => v.id === variantId)
    if (variant) {
      Object.assign(variant, patch)
      return variant
    }
  }
  return undefined
}

export function addSellerVariant(productId: string, variant: SellerVariant): SellerVariant | undefined {
  const detail = findSellerProductDetail(productId)
  if (!detail) {
    return undefined
  }
  detail.variants = [...detail.variants, variant]
  return variant
}

/** Mirrors the API's two refusals so the page's error paths are reachable. */
export function removeSellerVariant(variantId: string): 'ok' | 'not-found' | 'last-variant' {
  for (const detail of Object.values(details)) {
    if (detail.variants.some((v) => v.id === variantId)) {
      if (detail.variants.length <= 1) {
        return 'last-variant'
      }
      detail.variants = detail.variants.filter((v) => v.id !== variantId)
      return 'ok'
    }
  }
  return 'not-found'
}

/** Matches the backend's cap, which counts PENDING rows as well as STORED ones. */
export const MAX_IMAGES_PER_PRODUCT = 7

/**
 * What POST /images/upload-url does on the backend: reserves a PENDING row that
 * already counts against the cap, so a batch of presigns fills the product up the
 * same way here as it does there.
 */
export function reserveSellerImage(
  productId: string,
  position: number,
): { id: string } | 'not-found' | 'too-many-images' {
  const detail = findSellerProductDetail(productId)
  if (!detail) return 'not-found'
  if (detail.images.length >= MAX_IMAGES_PER_PRODUCT) return 'too-many-images'
  const id = crypto.randomUUID()
  detail.images.push({ id, url: `https://mock-s3.local/stored/${id}`, position, status: 'PENDING' })
  return { id }
}

/** POST /images/confirm: the row becomes visible to buyers. */
export function confirmSellerImage(imageId: string): boolean {
  for (const detail of Object.values(details)) {
    const image = detail.images.find((i) => i.id === imageId)
    if (image) {
      image.status = 'STORED'
      return true
    }
  }
  return false
}

/**
 * PUT /images/order: the whole ordering at once, so a swap never needs a
 * transient duplicate position. Renumbers from zero in the order given, which
 * makes the first id the cover.
 */
export function reorderSellerImages(
  productId: string,
  imageIds: string[],
): 'not-found' | 'mismatch' | { ok: true } {
  const detail = findSellerProductDetail(productId)
  if (!detail) return 'not-found'

  // Every image exactly once, and nothing from another product - a partial list
  // would silently drop whatever it left out.
  const current = detail.images.map((image) => image.id)
  const given = new Set(imageIds)
  if (given.size !== imageIds.length || given.size !== current.length) return 'mismatch'
  if (current.some((id) => !given.has(id))) return 'mismatch'

  detail.images = imageIds.map((id, position) => ({
    ...detail.images.find((image) => image.id === id)!,
    position,
  }))
  return { ok: true }
}

export function removeSellerImage(imageId: string): boolean {
  for (const detail of Object.values(details)) {
    if (detail.images.some((i) => i.id === imageId)) {
      detail.images = detail.images.filter((i) => i.id !== imageId)
      return true
    }
  }
  return false
}

// --- /api/v1/sellers/me/products -------------------------------------------
// Derived from the same store the unversioned endpoints serve, so the portal
// list and the product form never disagree about what exists - including about
// status, which the form now writes. It used to be guessed here as "no variants
// means draft", so a listing the seller had explicitly unpublished still read as
// Active in their own catalogue. Absent means ACTIVE, matching what the create
// endpoint does with an omitted status.

type SellerProductRow = components['schemas']['SellerProductRow']

export function listSellerProductRows(): SellerProductRow[] {
  return listSellerProducts().map((summary) => {
    const detail = findSellerProductDetail(summary.id)
    const variants = detail?.variants ?? []
    // A variant's price is nullable, and a product priced entirely by
    // nulls has no range to show.
    const prices = variants.map((v) => v.price).filter((p): p is number => p != null)
    const totalStock = variants.reduce((sum, v) => sum + v.stockQty, 0)

    return {
      id: summary.id,
      productRef: summary.slug,
      title: summary.title,
      brandName: detail?.brandName ?? null,
      thumbnailUrl: summary.thumbnailUrl,
      imageCount: detail?.images.length ?? 0,
      category: summary.category,
      status: detail?.status ?? 'ACTIVE',
      variantCount: summary.variantCount,
      totalStock,
      priceFrom: prices.length ? Math.min(...prices) : undefined,
      priceTo: prices.length ? Math.max(...prices) : undefined,
      createdAt: summary.createdAt,
      updatedAt: summary.createdAt,
    }
  })
}

/**
 * Open orders per product, for the seller product drawer. Keyed by product id;
 * a product with no entry has none, which is the common case and the empty
 * state the design calls for.
 */
type ProductOpenOrders = components['schemas']['ProductOpenOrders']

/**
 * Demo open orders, on the same product the demo catalogue leads with, so the
 * dev server shows the drawer's Active orders list rather than only its empty
 * state. Cleared by resetProductOpenOrders() in tests, exactly as the product
 * seed is, so no test inherits it.
 */
const DEMO_OPEN_ORDERS: Record<string, ProductOpenOrders> = {
  '11111111-1111-1111-1111-111111111111': {
    openOrderCount: 2,
    reservedUnits: 4,
    orders: [
      {
        orderId: 'c41d9a70-0000-4000-8000-000000000001',
        orderLineId: 'c41d9a70-0000-4000-8000-00000000000a',
        buyerEmail: 'm.okafor@example.com',
        variantId: '11111111-variant-0',
        variantLabel: 'Default',
        quantity: 1,
        status: 'PLACED',
        placedAt: '2026-09-24T09:00:00.000Z',
      },
      {
        orderId: 'c41d9a70-0000-4000-8000-000000000001',
        orderLineId: 'c41d9a70-0000-4000-8000-00000000000b',
        buyerEmail: 'm.okafor@example.com',
        variantId: '11111111-variant-1',
        variantLabel: 'Option 2',
        quantity: 2,
        status: 'PLACED',
        placedAt: '2026-09-24T09:00:00.000Z',
      },
      {
        orderId: '7b02e315-0000-4000-8000-000000000002',
        orderLineId: '7b02e315-0000-4000-8000-00000000000a',
        buyerEmail: 'j.lindqvist@example.com',
        variantId: '11111111-variant-0',
        variantLabel: 'Default',
        quantity: 1,
        status: 'SHIPPED',
        placedAt: '2026-09-21T09:00:00.000Z',
      },
    ],
  },
}

let openOrders: Record<string, ProductOpenOrders> = { ...DEMO_OPEN_ORDERS }

export function resetProductOpenOrders(seed: Record<string, ProductOpenOrders> = {}) {
  openOrders = { ...seed }
}

export function setProductOpenOrders(productId: string, value: ProductOpenOrders) {
  openOrders[productId] = value
}

export function findProductOpenOrders(productId: string): ProductOpenOrders {
  return openOrders[productId] ?? { openOrderCount: 0, reservedUnits: 0, orders: [] }
}
