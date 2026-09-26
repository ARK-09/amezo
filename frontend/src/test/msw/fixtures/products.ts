import type { components } from '@/lib/api/schema'

import { categoryBySlug } from './categories'

type ProductSummary = components['schemas']['ProductSummary']

/**
 * Two sellers, so the "a seller cannot buy their own product" rule has something to
 * be true and false about in the same dataset.
 */
export const SELLER_ONE = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'
export const SELLER_TWO = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'

/** The slug each product is reachable by, derived the way the backend derives it. */
function slugFor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** slug, sellerId and the default-variant fields are filled in by seedProducts. */
type BaseProduct = Omit<
  ProductSummary,
  'slug' | 'sellerId' | 'defaultVariantId' | 'defaultVariantPrice'
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
