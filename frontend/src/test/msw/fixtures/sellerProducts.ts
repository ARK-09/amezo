import type { components } from '@/lib/api/schema'

type SellerProductSummary = components['schemas']['SellerProductSummary']

// Demo-account starting catalog (browser/dev only - every test resets this
// to [] via resetSellerProducts() in beforeEach/afterEach). Same 5 of the 6
// products from fixtures/products.ts, so the seller portal and the buyer
// catalog show the same items instead of two unrelated demo datasets.
const DEMO_SEED: SellerProductSummary[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Wireless Noise-Cancelling Headphones',
    thumbnailUrl: null,
    category: 'Electronics',
    variantCount: 2,
    createdAt: '2026-09-20T09:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    title: '14" Ultrabook Laptop, 16GB RAM',
    thumbnailUrl: null,
    category: 'Electronics',
    variantCount: 1,
    createdAt: '2026-09-19T09:00:00.000Z',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    title: 'Ceramic Non-Stick Cookware Set (10-piece)',
    thumbnailUrl: null,
    category: 'Kitchen',
    variantCount: 1,
    createdAt: '2026-09-18T09:00:00.000Z',
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    title: 'Mechanical Keyboard, Hot-Swappable',
    thumbnailUrl: null,
    category: 'Electronics',
    variantCount: 2,
    createdAt: '2026-09-17T09:00:00.000Z',
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    title: 'Stainless Steel Water Bottle, 32oz',
    thumbnailUrl: null,
    category: 'Outdoor',
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
