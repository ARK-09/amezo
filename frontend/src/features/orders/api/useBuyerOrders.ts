import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components, operations } from '@/lib/api/schema'

export type BuyerOrderSummary = components['schemas']['BuyerOrderSummary']
export type BuyerOrderDetail = components['schemas']['BuyerOrderDetail']
export type BuyerOrderLine = components['schemas']['BuyerOrderLine']
export type OrderStatus = components['schemas']['OrderStatus']
export type OrderTimelineEntry = components['schemas']['OrderTimelineEntry']
type BuyerOrderSummaryPage = components['schemas']['BuyerOrderSummaryPage']

export type BuyerOrderFilters = NonNullable<operations['listBuyerOrders']['parameters']['query']>
export type BuyerOrderGroup = NonNullable<BuyerOrderFilters['group']>
export type BuyerOrderFacetFilters = NonNullable<
  operations['getBuyerOrderFacets']['parameters']['query']
>

export const buyerOrderKeys = {
  all: ['buyer', 'orders'] as const,
  list: (filters: BuyerOrderFilters) => [...buyerOrderKeys.all, 'list', filters] as const,
  facets: (filters: BuyerOrderFacetFilters) => [...buyerOrderKeys.all, 'facets', filters] as const,
  detail: (orderId: string) => [...buyerOrderKeys.all, 'detail', orderId] as const,
}

/**
 * `enabled` exists for one caller: My Orders turns both queries off for a
 * seller. `/api/v1/orders` is buyer-only, so asking it on a seller's behalf can
 * only ever come back 401 - and a 401 about a valid seller session reads as
 * "your session expired", which is a lie the page then prints.
 */
export interface BuyerOrderQueryOptions {
  enabled?: boolean
}

export function useBuyerOrders(filters: BuyerOrderFilters, options: BuyerOrderQueryOptions = {}) {
  return useQuery<BuyerOrderSummaryPage, ProblemDetail>({
    queryKey: buyerOrderKeys.list(filters),
    enabled: options.enabled ?? true,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/orders', { signal, params: { query: filters } })
      if (error) throw error
      return data
    },
    // Paging and tab switches keep the previous page on screen instead of
    // flashing the empty state between two populated ones.
    placeholderData: keepPreviousData,
  })
}

/**
 * The number on each tab, as a group -> count map.
 *
 * Its own request, not a field on the list: the strip describes every bucket at
 * once, so counts that arrived with a filtered list could only ever describe
 * the tab already open. The group is deliberately absent from both the filters
 * and the key - selecting a tab reads this same cache rather than refetching
 * numbers that would come back identical.
 */
export function useBuyerOrderFacets(
  filters: BuyerOrderFacetFilters,
  options: BuyerOrderQueryOptions = {},
) {
  return useQuery<Map<string, number>, ProblemDetail>({
    queryKey: buyerOrderKeys.facets(filters),
    enabled: options.enabled ?? true,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/orders/facets', {
        signal,
        params: { query: filters },
      })
      if (error) throw error
      // Keyed by the same group values the list takes, so a tab needs no
      // translation table. `value` is null for buyer buckets - counts only.
      return new Map(data.facets.map((facet) => [facet.key, facet.count] as const))
    },
    // A count one search behind beats a strip that empties while the next
    // one lands.
    placeholderData: keepPreviousData,
  })
}

export function useBuyerOrder(orderId: string | undefined) {
  return useQuery<BuyerOrderDetail, ProblemDetail>({
    queryKey: buyerOrderKeys.detail(orderId ?? ''),
    enabled: Boolean(orderId),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/orders/{orderId}', {
        signal,
        params: { path: { orderId: orderId! } },
      })
      if (error) throw error
      return data
    },
  })
}
