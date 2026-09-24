import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'

import type { ProductDetail } from '../schema/types'

export const productKeys = {
  all: ['catalog', 'product'] as const,
  detail: (productId: string) => [...productKeys.all, productId] as const,
}

export function useProduct(productId: string) {
  return useQuery<ProductDetail, ProblemDetail>({
    queryKey: productKeys.detail(productId),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products/{productId}', {
        signal,
        params: { path: { productId } },
      })
      if (error) throw error
      return data
    },
  })
}
