import { describe, expect, it } from 'vitest'

import { categoryImage, categoryImageSlugs } from '@/features/reference/categoryImage'
import { systemCategories } from '@/test/msw/fixtures/categories'

describe('category images', () => {
  /**
   * The rail keys on the server's slug, so artwork filed under a slug the backend
   * doesn't seed would silently never render.
   */
  it('has artwork for every system category', () => {
    const missing = systemCategories.filter((category) => categoryImage(category.slug) === null)
    expect(missing.map((category) => category.slug)).toEqual([])
  })

  it('covers the thirteen categories the migrations seed', () => {
    expect(categoryImageSlugs()).toEqual([
      'apparel',
      'automotive',
      'baby',
      'beauty',
      'books',
      'clothing',
      'electronics',
      'footwear',
      'home',
      'kitchen',
      'outdoor',
      'sports',
      'toys',
    ])
  })

  /** A category added server-side tomorrow must not break the rail today. */
  it('returns null for an unknown slug rather than throwing', () => {
    expect(categoryImage('gardening')).toBeNull()
  })

  /** There is no second category roster here - only a picture per slug. */
  it('exposes no category names or ordering of its own', () => {
    expect(categoryImageSlugs()).not.toContain('Electronics')
  })
})
