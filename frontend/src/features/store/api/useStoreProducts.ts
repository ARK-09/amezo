import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { ProductSummary } from '@/features/search/schema/types'

// GET /products has no brand or seller filter (see openapi/fixture.yaml), and
// there is no storefront endpoint at all, so a store's listings are found by
// pulling a page of the catalog and narrowing it here. This is the one thing
// on the page that will not survive a real catalog - swap it for a
// server-side ?sellerId= the day the API grows one.
const CATALOG_SCAN_SIZE = 100

export const storeKeys = {
  all: ['store'] as const,
  products: (brand: string) => [...storeKeys.all, brand] as const,
}

export function useStoreProducts(brand: string) {
  return useQuery<ProductSummary[], ProblemDetail>({
    queryKey: storeKeys.products(brand),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products', {
        signal,
        params: { query: { page: 0, size: CATALOG_SCAN_SIZE } },
      })
      if (error) throw error
      return data.content.filter((product) => product.brandName === brand)
    },
    staleTime: 5 * 60 * 1000,
  })
}
