import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

import { PAGE_SIZE } from '../schema/types'
import type { SearchFilters } from '../schema/types'

export const searchKeys = {
  all: ['search'] as const,
  list: (filters: SearchFilters) => [...searchKeys.all, filters] as const,
}

type ProductSummaryPage = components['schemas']['ProductSummaryPage']

export function useSearchProducts(filters: SearchFilters) {
  return useQuery<ProductSummaryPage, ProblemDetail>({
    queryKey: searchKeys.list(filters),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products', {
        signal,
        params: {
          query: {
            q: filters.q || undefined,
            category: filters.category || undefined,
            priceMin: filters.priceMin,
            priceMax: filters.priceMax,
            inStockOnly: filters.inStockOnly || undefined,
            sort: filters.sort,
            page: filters.page,
            size: PAGE_SIZE,
          },
        },
      })
      if (error) throw error
      return data
    },
    placeholderData: keepPreviousData,
  })
}

// No facets endpoint exists to list distinct categories (flagged separately) —
// this samples an unfiltered page and derives options from it client-side, so
// the dropdown doesn't collapse to one option once a category is selected.
export function useCategoryOptions() {
  return useQuery({
    queryKey: [...searchKeys.all, 'categories'] as const,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products', {
        signal,
        params: { query: { page: 0, size: 100 } },
      })
      if (error) throw error
      return Array.from(new Set(data.content.map((p) => p.category))).sort()
    },
    staleTime: 5 * 60 * 1000,
  })
}
