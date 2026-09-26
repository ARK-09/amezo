import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

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
            size: filters.size,
          },
        },
      })
      if (error) throw error
      return data
    },
    placeholderData: keepPreviousData,
  })
}
