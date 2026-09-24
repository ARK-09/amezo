import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

import { REVIEWS_PAGE_SIZE } from '../schema/types'

type ReviewPage = components['schemas']['ReviewPage']

export const reviewKeys = {
  all: ['catalog', 'reviews'] as const,
  list: (productId: string, page: number) => [...reviewKeys.all, productId, page] as const,
}

export function useProductReviews(productId: string, page: number, enabled: boolean) {
  return useQuery<ReviewPage, ProblemDetail>({
    queryKey: reviewKeys.list(productId, page),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products/{productId}/reviews', {
        signal,
        params: { path: { productId }, query: { page, size: REVIEWS_PAGE_SIZE } },
      })
      if (error) throw error
      return data
    },
    enabled,
    placeholderData: keepPreviousData,
  })
}
