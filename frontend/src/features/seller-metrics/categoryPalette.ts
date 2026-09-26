import type { CategoryShare } from './api/useSellerMetrics'

/**
 * The categorical slots the category donut draws from.
 *
 * Five hues in a fixed order, assigned in sequence and never cycled. The order
 * is the colour-blind-safety mechanism rather than a matter of taste: it was
 * picked by enumerating every ordering of the reference palette's eight hues
 * that leads with the brand's orange and keeping the one with the widest
 * worst adjacent pair. Checked against the data-viz validator in both modes -
 * worst adjacent pair ΔE 9.2 (deuteranopia) / 19.6 (normal vision) on light,
 * 9.4 / 19.3 on dark, against targets of 8 and 15.
 *
 * Three of the light steps sit below 3:1 on a white surface, and on the
 * stricter all-pairs list orange and magenta are closer than the floor allows.
 * Both are why the donut is never only colour: every slice is separated from
 * its neighbours by a gap, and the legend beside it names each one with its
 * share and its revenue. Take either away and the palette stops being legal.
 */
const SLOTS = [
  { light: '#eb6834', dark: '#d95926' }, // orange
  { light: '#1baf7a', dark: '#199e70' }, // aqua
  { light: '#2a78d6', dark: '#3987e5' }, // blue
  { light: '#eda100', dark: '#c98500' }, // yellow
  { light: '#e87ba4', dark: '#d55181' }, // magenta
] as const

/** Reserved, deliberately outside the hues above, so it cannot read as a category. */
const OTHER_SLOT = { light: '#8a8a8a', dark: '#9c9c9c' } as const

export interface DonutSlice {
  /** Also the chart config key, so it has to be safe inside a CSS custom property name. */
  key: string
  label: string
  revenue: number
  share: number
  color: { light: string; dark: string }
}

const OTHER_KEY = 'other'

/**
 * Turns the breakdown into the slices the donut draws: the five largest
 * categories, with everything past them folded into one neutral "Other" rather
 * than given a sixth, seventh, eighth hue nobody could tell apart. Six
 * segments is also as many as a donut can carry before it stops being
 * readable at a glance, which is the only thing this chart is for.
 *
 * Slices are ordered by revenue, which is what a part-to-whole reader looks
 * for, but a slice's *colour* comes from where its slug sorts among the ones on
 * screen - not from its rank. A month where Kitchen outsells Outdoor swaps the
 * two slices round; it must not also swap their colours, or a seller who
 * learned "Kitchen is orange" is reading a different chart every window.
 */
export function donutSlices(rows: CategoryShare[]): DonutSlice[] {
  const ranked = [...rows].sort((a, b) => b.revenue - a.revenue)
  const named = ranked.slice(0, SLOTS.length)
  const rest = ranked.slice(SLOTS.length)

  const bySlug = [...named]
    .map((row) => row.category.slug)
    .sort((a, b) => a.localeCompare(b))

  const slices: DonutSlice[] = named.map((row) => ({
    key: cssKey(row.category.slug),
    label: row.category.name,
    revenue: row.revenue,
    share: row.share,
    color: SLOTS[bySlug.indexOf(row.category.slug)],
  }))

  if (rest.length > 0) {
    slices.push({
      key: OTHER_KEY,
      label: `Other (${rest.length})`,
      revenue: rest.reduce((sum, row) => sum + row.revenue, 0),
      share: rest.reduce((sum, row) => sum + row.share, 0),
      color: OTHER_SLOT,
    })
  }

  return slices
}

/** Slugs are already lowercase and dashed, but a stray character would break the var name. */
function cssKey(slug: string): string {
  return `cat-${slug.replace(/[^a-zA-Z0-9-]/g, '-')}`
}
