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

export function removeSellerImage(imageId: string): boolean {
  for (const detail of Object.values(details)) {
    if (detail.images.some((i) => i.id === imageId)) {
      detail.images = detail.images.filter((i) => i.id !== imageId)
      return true
    }
  }
  return false
}
