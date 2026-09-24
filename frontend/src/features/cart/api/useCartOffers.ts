import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'

import type { VariantOffer } from '../schema/types'

export const cartOffersKeys = {
  all: ['cart', 'offers'] as const,
  byIds: (ids: string[]) => [...cartOffersKeys.all, ids] as const,
}

export function useCartOffers(variantIds: string[], enabled: boolean) {
  const sortedIds = [...variantIds].sort()

  return useQuery<VariantOffer[], ProblemDetail>({
    queryKey: cartOffersKeys.byIds(sortedIds),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/variants', {
        signal,
        params: { query: { ids: sortedIds.join(',') } },
      })
      if (error) throw error
      return data
    },
    enabled: enabled && sortedIds.length > 0,
    staleTime: 0,
  })
}
