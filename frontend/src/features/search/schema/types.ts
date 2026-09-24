import type { components } from '@/lib/api/schema'

export type ProductSummary = components['schemas']['ProductSummary']

export type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'newest'

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
]

export const PAGE_SIZE = 16

export interface SearchFilters {
  q: string
  category: string
  priceMin: number | undefined
  priceMax: number | undefined
  inStockOnly: boolean
  sort: SortOption
  page: number
}

export const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  category: '',
  priceMin: undefined,
  priceMax: undefined,
  inStockOnly: false,
  sort: 'relevance',
  page: 0,
}
