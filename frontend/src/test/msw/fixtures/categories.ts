import type { components } from '@/lib/api/schema'

type Category = components['schemas']['Category']

/**
 * The mock system category list. Mirrors the rows V14 seeds, so a test that picks
 * "Apparel" is picking something the real backend also has - a fixture category
 * that doesn't exist in the migration would pass here and 404 in production.
 */
export const systemCategories: Category[] = [
  { slug: 'electronics', name: 'Electronics' },
  { slug: 'apparel', name: 'Apparel' },
  { slug: 'footwear', name: 'Footwear' },
  { slug: 'kitchen', name: 'Kitchen' },
  { slug: 'outdoor', name: 'Outdoor' },
  { slug: 'sports', name: 'Sports' },
  { slug: 'books', name: 'Books' },
  { slug: 'toys', name: 'Toys' },
  { slug: 'baby', name: 'Baby' },
  { slug: 'beauty', name: 'Beauty' },
  { slug: 'home', name: 'Home' },
  { slug: 'automotive', name: 'Automotive' },
]

/** Looks a slug up the way the API's nested category object would arrive. */
export function categoryBySlug(slug: string): Category {
  const found = systemCategories.find((category) => category.slug === slug)
  if (!found) throw new Error(`No mock category '${slug}' - add it to systemCategories`)
  return found
}
