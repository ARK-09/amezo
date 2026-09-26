import type { components } from '@/lib/api/schema'

import { categoryBySlug } from './categories'
import { STORE_PROFILE_ID } from './storeProfile'

type ProductSummary = components['schemas']['ProductSummary']
type StoreRef = components['schemas']['StoreRef']

/**
 * Two sellers, so the "a seller cannot buy their own product" rule has something to
 * be true and false about in the same dataset.
 */
export const SELLER_ONE = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'
export const SELLER_TWO = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'

/**
 * The store each brand trades as. The catalogue always carried this
 * relationship, but only as brandName - a display string the storefront matched
 * on, so a rename broke every link and two sellers sharing a brand name shared
 * a page. Written down as a StoreRef it becomes a key.
 *
 * 'Aurora Audio' is the demo seller's own store, so it carries the id
 * fixtures/storeProfile.ts holds: one store, two sides of the same counter.
 */
const STORE_BY_BRAND: Record<string, StoreRef> = {
  'Aurora Audio': { id: STORE_PROFILE_ID, name: 'Aurora Audio', handle: 'aurora-audio' },
  Vexel: { id: 'cccccccc-3333-3333-3333-cccccccccccc', name: 'Vexel', handle: 'vexel' },
  'Hearth & Home': {
    id: 'dddddddd-4444-4444-4444-dddddddddddd',
    name: 'Hearth & Home',
    handle: 'hearth-and-home',
  },
  Northpeak: { id: 'eeeeeeee-5555-5555-5555-eeeeeeeeeeee', name: 'Northpeak', handle: 'northpeak' },
}

/** Every store the catalogue lists for, in the order the brands first appear. */
export function seedStoreRefs(): StoreRef[] {
  return Object.values(STORE_BY_BRAND)
}

/** Throws rather than shipping a product whose brand belongs to no store. */
function storeForBrand(brandName: string): StoreRef {
  const found = STORE_BY_BRAND[brandName]
  if (!found) throw new Error(`No mock store for brand '${brandName}' - add it to STORE_BY_BRAND`)
  return found
}

/** The slug each product is reachable by, derived the way the backend derives it. */
function slugFor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** slug, store, sellerId and the default-variant fields are filled in by seedProducts. */
type BaseProduct = Omit<
  ProductSummary,
  'slug' | 'store' | 'sellerId' | 'defaultVariantId' | 'defaultVariantPrice'
>

const BASE_PRODUCTS: BaseProduct[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Wireless Noise-Cancelling Headphones',
    brandName: 'Aurora Audio',
    category: categoryBySlug('electronics'),
    priceFrom: 129.99,
    thumbnailUrl: null,
    avgRating: 4.5,
    reviewCount: 128,
    inStock: true,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    title: '14" Ultrabook Laptop, 16GB RAM',
    brandName: 'Vexel',
    category: categoryBySlug('electronics'),
    priceFrom: 899,
    thumbnailUrl: null,
    avgRating: 4.8,
    reviewCount: 42,
    inStock: true,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    title: 'Ceramic Non-Stick Cookware Set (10-piece)',
    brandName: 'Hearth & Home',
    category: categoryBySlug('kitchen'),
    priceFrom: 74.5,
    thumbnailUrl: null,
    avgRating: null,
    reviewCount: 0,
    inStock: true,
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    title: 'Trail Running Shoes',
    brandName: 'Northpeak',
    category: categoryBySlug('footwear'),
    priceFrom: 64,
    thumbnailUrl: null,
    avgRating: 4.1,
    reviewCount: 24,
    inStock: false,
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    title: 'Mechanical Keyboard, Hot-Swappable',
    brandName: 'Vexel',
    category: categoryBySlug('electronics'),
    priceFrom: 149,
    thumbnailUrl: null,
    avgRating: 4.6,
    reviewCount: 24,
    inStock: true,
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    title: 'Stainless Steel Water Bottle, 32oz',
    brandName: 'Hearth & Home',
    category: categoryBySlug('outdoor'),
    priceFrom: 22,
    thumbnailUrl: null,
    avgRating: null,
    reviewCount: 0,
    inStock: true,
  },
]

/**
 * defaultVariantId / defaultVariantPrice, the fields a tile adds to the cart
 * from. productDetails builds '<id>-v1' as each product's first variant, priced
 * at priceFrom, so that is the default - spelled out here rather than imported
 * from that fixture, which derives itself from this one.
 */
export const seedProducts: ProductSummary[] = BASE_PRODUCTS.map((product, index) => ({
  ...product,
  slug: slugFor(product.title),
  // brandName stays as it is - it is what a card prints, and still required by
  // the contract. store is the same fact as a key, for linking and filtering.
  store: storeForBrand(product.brandName),
  // Alternating owners: half the catalog belongs to each seller, so a test signed
  // in as SELLER_ONE has both its own products and somebody else's on screen.
  sellerId: index % 2 === 0 ? SELLER_ONE : SELLER_TWO,
  defaultVariantId: `${product.id}-v1`,
  defaultVariantPrice: product.priceFrom,
}))

/** The seed product with this slug, for tests that navigate by URL. */
export function seedProductBySlug(slug: string): ProductSummary {
  const found = seedProducts.find((product) => product.slug === slug)
  if (!found) throw new Error(`No seed product with slug '${slug}'`)
  return found
}
