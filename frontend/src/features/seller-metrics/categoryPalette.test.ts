import { describe, expect, it } from 'vitest'

import { donutSlices } from './categoryPalette'
import type { CategoryShare } from './api/useSellerMetrics'

function share(slug: string, revenue: number): CategoryShare {
  return {
    category: { slug, name: slug[0].toUpperCase() + slug.slice(1) },
    revenue,
    units: revenue,
    share: revenue / 100,
  }
}

describe('donutSlices', () => {
  it('draws the ring biggest first', () => {
    const slices = donutSlices([share('kitchen', 20), share('audio', 50), share('outdoor', 30)])

    expect(slices.map((slice) => slice.label)).toEqual(['Audio', 'Outdoor', 'Kitchen'])
  })

  it('keeps a category its colour when the ranking moves under it', () => {
    const quiet = donutSlices([share('audio', 50), share('kitchen', 20), share('outdoor', 30)])
    const busy = donutSlices([share('audio', 50), share('kitchen', 40), share('outdoor', 10)])

    const colourOf = (slices: ReturnType<typeof donutSlices>, label: string) =>
      slices.find((slice) => slice.label === label)!.color.light

    // Kitchen overtakes Outdoor between the two windows, so the slices swap
    // places. A seller who learned which colour is Kitchen must not have to
    // learn it again every time the month goes differently.
    expect(busy.map((slice) => slice.label)).toEqual(['Audio', 'Kitchen', 'Outdoor'])
    expect(colourOf(busy, 'Kitchen')).toBe(colourOf(quiet, 'Kitchen'))
    expect(colourOf(busy, 'Outdoor')).toBe(colourOf(quiet, 'Outdoor'))
  })

  it('gives every slice a colour of its own', () => {
    const slices = donutSlices([
      share('audio', 50),
      share('books', 40),
      share('kitchen', 30),
      share('outdoor', 20),
      share('tools', 10),
    ])

    expect(new Set(slices.map((slice) => slice.color.light)).size).toBe(5)
  })

  it('folds the tail into one Other rather than inventing a sixth hue', () => {
    const slices = donutSlices([
      share('audio', 50),
      share('books', 40),
      share('kitchen', 30),
      share('outdoor', 20),
      share('tools', 10),
      share('garden', 6),
      share('pets', 4),
    ])

    expect(slices).toHaveLength(6)
    const other = slices[5]
    expect(other.label).toBe('Other (2)')
    expect(other.revenue).toBe(10)
    expect(other.share).toBeCloseTo(0.1)
    // Reserved, so it cannot be mistaken for one of the named categories.
    expect(slices.slice(0, 5).map((slice) => slice.color.light)).not.toContain(other.color.light)
  })

  it('has nothing to draw for a window with no sales', () => {
    expect(donutSlices([])).toEqual([])
  })
})
