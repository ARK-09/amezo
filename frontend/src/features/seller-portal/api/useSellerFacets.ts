import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { refundKeys } from '@/features/refunds/api/useRefundRequests'
import { sellerOrderKeys } from '@/features/seller-portal/api/useSellerOrders'
import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

/** One bucket of a tab strip. `key` is what the matching list endpoint takes
 *  for that bucket, so a tab becomes a filter without a translation table. */
export type Facet = components['schemas']['Facet']

/**
 * Nested under the roots the lists and the mutations already invalidate.
 * Packing an order or settling a refund moves a row between buckets, so the
 * numbers have to go stale with the list they describe - a strip left on the
 * old counts is worse than one with no counts at all.
 *
 * Keyed by the search term and nothing else: the endpoints deliberately ignore
 * the bucket being viewed, because a strip that counted only the current tab
 * would report zero for every other one.
 */
export const sellerFacetKeys = {
  orders: (q: string) => [...sellerOrderKeys.all, 'facets', q] as const,
  refunds: (q: string) => [...refundKeys.all, 'seller', 'facets', q] as const,
}

export function useSellerOrderFacets(q?: string) {
  return useQuery<Facet[], ProblemDetail>({
    queryKey: sellerFacetKeys.orders(q ?? ''),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/orders/facets', {
        signal,
        params: { query: { q } },
      })
      if (error) throw error
      return data.facets
    },
    // The counts describe the same rows the list is fetching, so hold the old
    // ones through a keystroke rather than blanking the strip on every letter.
    placeholderData: keepPreviousData,
  })
}

export function useSellerRefundFacets(q?: string) {
  return useQuery<Facet[], ProblemDetail>({
    queryKey: sellerFacetKeys.refunds(q ?? ''),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/refund-requests/facets', {
        signal,
        params: { query: { q } },
      })
      if (error) throw error
      return data.facets
    },
    placeholderData: keepPreviousData,
  })
}
