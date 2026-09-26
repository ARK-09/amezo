import type { components } from '@/lib/api/schema'

export type ProductSummary = components['schemas']['ProductSummary']

export type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'newest'

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
]

/** The sizes the design's Per page select offers, and the one it opens on. */
export const PAGE_SIZES = [5, 10, 20, 50] as const
// 20, not the 10 the seller tables default to. Those are tables, where ten rows
// is a screenful; this is a grid about six cards wide, so ten leaves two thin
// rows and pages a shopper who is browsing. 20 is the nearest offered size to
// the 16 this page used before the selector existed.
export const DEFAULT_SIZE = 20

export interface SearchFilters {
  q: string
  category: string
  priceMin: number | undefined
  priceMax: number | undefined
  inStockOnly: boolean
  sort: SortOption
  page: number
  /** One of PAGE_SIZES: the grid's page size is the shopper's, not a constant. */
  size: number
}

export const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  category: '',
  priceMin: undefined,
  priceMax: undefined,
  inStockOnly: false,
  sort: 'relevance',
  page: 0,
  size: DEFAULT_SIZE,
}
