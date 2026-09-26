import type { components } from '@/lib/api/schema'

import { seedProducts } from './products'

type ProductDetail = components['schemas']['ProductDetail']
type Review = components['schemas']['Review']

/**
 * The specification table under the Details tab. Only the two listings whose
 * designs show one carry attributes, so the "a listing without them renders
 * nothing" path stays exercised by every other product.
 */
const ATTRIBUTES: Record<string, { label: string; value: string }[]> = {
  '11111111-1111-1111-1111-111111111111': [
    { label: 'Battery life', value: '30 hours' },
    { label: 'Connectivity', value: 'Bluetooth 5.3, USB-C' },
    { label: 'Noise cancellation', value: 'Active, adaptive' },
    { label: 'Weight', value: '250 g' },
  ],
  '22222222-2222-2222-2222-222222222222': [
    { label: 'Display', value: '14" full HD' },
    { label: 'Memory', value: '16 GB' },
    { label: 'Chassis', value: 'Aluminium' },
  ],
}

const DESCRIPTIONS: Record<string, string> = {
  '11111111-1111-1111-1111-111111111111':
    'Over-ear headphones with active noise cancellation, 30-hour battery life, and a foldable design for travel. Includes a hard case and USB-C fast charging.',
  '22222222-2222-2222-2222-222222222222':
    'A lightweight ultrabook built for everyday work: fast boot times, a full-HD display, and all-day battery life in a compact aluminum chassis.',
  '33333333-3333-3333-3333-333333333333':
    'A 10-piece ceramic non-stick cookware set safe up to 450°F, dishwasher-friendly, and compatible with induction, gas, and electric stovetops.',
  '44444444-4444-4444-4444-444444444444':
    'Trail running shoes with a grippy lugged outsole, breathable mesh upper, and a rock plate for protection on technical terrain.',
  '55555555-5555-5555-5555-555555555555':
    'A hot-swappable mechanical keyboard with per-key RGB, a detachable USB-C cable, and a gasket-mounted plate for a softer typing feel.',
  '66666666-6666-6666-6666-666666666666':
    'A double-wall insulated stainless steel bottle that keeps drinks cold for 24 hours or hot for 12, with a leak-proof lid.',
}

function variantsFor(id: string, basePrice: number, inStock: boolean) {
  const twoVariant = id === '11111111-1111-1111-1111-111111111111' || id === '55555555-5555-5555-5555-555555555555'
  if (!twoVariant) {
    return [
      { id: `${id}-v1`, label: 'Standard', sku: `${id}-STD`, price: basePrice, stockQty: inStock ? 12 : 0 },
    ]
  }
  return [
    { id: `${id}-v1`, label: 'Black', sku: `${id}-BLK`, price: basePrice, stockQty: inStock ? 8 : 0 },
    { id: `${id}-v2`, label: 'White', sku: `${id}-WHT`, price: basePrice + 10, stockQty: inStock ? 3 : 0 },
  ]
}

/**
 * Keyed by BOTH slug and id, because the API resolves either - a page reached by a
 * legacy id URL has to find the same product the slug does.
 */
export const productDetails: Record<string, ProductDetail> = Object.fromEntries(
  seedProducts.flatMap((p) => [p.id, p.slug].map((key) => [
    key,
    {
      id: p.id,
      slug: p.slug,
      // The same owner the summary carries, so the own-product rule behaves
      // identically whether a test starts from a card or from the detail page.
      sellerId: p.sellerId,
      title: p.title,
      brandName: p.brandName,
      // The same store ref the summary carries, so the detail page links to the
      // storefront by handle rather than by the display name beside it.
      store: p.store,
      description: DESCRIPTIONS[p.id] ?? '',
      attributes: ATTRIBUTES[p.id] ?? [],
      category: p.category,
      images: [],
      variants: variantsFor(p.id, p.priceFrom, p.inStock),
      reviewSummary: { averageRating: p.avgRating ?? null, count: p.avgRating != null ? 3 : 0 },
    } satisfies ProductDetail,
  ])),
)

const REVIEW_TEMPLATES: [string, number, string][] = [
  ['Jordan K.', 5, "Exactly as described, arrived fast, works great. Would buy again."],
  ['Sam T.', 4, 'Good value for the price. One small issue on arrival but support sorted it quickly.'],
  ['Riley P.', 5, "Better than expected. Solid build quality and does what it says."],
]

export function reviewsFor(productId: string): Review[] {
  const detail = productDetails[productId]
  if (!detail || detail.reviewSummary.count === 0) return []
  const variantLabel = detail.variants[0]?.label ?? 'Standard'
  return REVIEW_TEMPLATES.map(([name, rating, body], i) => ({
    id: `${productId}-review-${i}`,
    rating,
    body,
    variantLabel,
    createdAt: new Date(2026, 5 + i, 10).toISOString(),
    reviewerName: name,
  }))
}

/**
 * Reviews written during a test, keyed by product id. Separate from the templated
 * seed reviews so a test can assert on exactly what it submitted without the three
 * canned ones in the way.
 */
const writtenReviews = new Map<string, Review[]>()

export function addWrittenReview(productId: string, review: Review) {
  writtenReviews.set(productId, [review, ...(writtenReviews.get(productId) ?? [])])
}

export function writtenReviewsFor(productId: string): Review[] {
  return writtenReviews.get(productId) ?? []
}

export function resetWrittenReviews() {
  writtenReviews.clear()
}
