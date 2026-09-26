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

export const buyerOrderKeys = {
  all: ['buyer', 'orders'] as const,
  list: (filters: BuyerOrderFilters) => [...buyerOrderKeys.all, 'list', filters] as const,
  detail: (orderId: string) => [...buyerOrderKeys.all, 'detail', orderId] as const,
}

export function useBuyerOrders(filters: BuyerOrderFilters) {
  return useQuery<BuyerOrderSummaryPage, ProblemDetail>({
    queryKey: buyerOrderKeys.list(filters),
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
