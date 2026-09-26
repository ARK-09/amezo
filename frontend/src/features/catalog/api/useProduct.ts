import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'

import type { ProductDetail } from '../schema/types'

export const productKeys = {
  all: ['catalog', 'product'] as const,
  detail: (productRef: string) => [...productKeys.all, productRef] as const,
}

/**
 * One product, addressed by slug. A legacy id still resolves - the API accepts
 * either - so an old bookmark loads the product and the page redirects to its slug
 * rather than 404ing.
 */
export function useProduct(productRef: string) {
  return useQuery<ProductDetail, ProblemDetail>({
    queryKey: productKeys.detail(productRef),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products/{productRef}', {
        signal,
        params: { path: { productRef } },
      })
      if (error) throw error
      return data
    },
  })
}
