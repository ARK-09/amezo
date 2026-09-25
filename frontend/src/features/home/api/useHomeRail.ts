import { useQuery } from '@tanstack/react-query'

import type { SortOption } from '@/features/search/schema/types'
import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

type ProductSummaryPage = components['schemas']['ProductSummaryPage']

export interface HomeRailParams {
  sort: SortOption
  size: number
  category?: string
  inStockOnly?: boolean
}

export const homeKeys = {
  all: ['home'] as const,
  rail: (params: HomeRailParams) => [...homeKeys.all, 'rail', params] as const,
}

// The landing page reads the same /products endpoint search does - there is
// no separate merchandising endpoint - so each rail is just a small,
// pre-sorted page of it. Cached long enough that bouncing between the landing
// page and a product doesn't refetch the whole front page every time.
export function useHomeRail(params: HomeRailParams, options: { enabled?: boolean } = {}) {
  return useQuery<ProductSummaryPage, ProblemDetail>({
    enabled: options.enabled ?? true,
    queryKey: homeKeys.rail(params),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products', {
        signal,
        params: {
          query: {
            sort: params.sort,
            page: 0,
            size: params.size,
            category: params.category || undefined,
            inStockOnly: params.inStockOnly || undefined,
          },
        },
      })
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
