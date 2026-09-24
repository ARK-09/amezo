import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

type SellerOrderSummaryPage = components['schemas']['SellerOrderSummaryPage']
type SellerOrderDetail = components['schemas']['SellerOrderDetail']
export type OrderStatus = components['schemas']['SellerOrderSummary']['status']

export const sellerOrderKeys = {
  all: ['seller', 'orders'] as const,
  list: (status: OrderStatus | undefined) => [...sellerOrderKeys.all, status] as const,
  detail: (orderId: string) => [...sellerOrderKeys.all, orderId] as const,
}

export function useSellerOrders(status: OrderStatus | undefined) {
  return useQuery<SellerOrderSummaryPage, ProblemDetail>({
    queryKey: sellerOrderKeys.list(status),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/sellers/me/orders', {
        signal,
        params: { query: { status, size: 100 } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useSellerOrderDetail(orderId: string) {
  return useQuery<SellerOrderDetail, ProblemDetail>({
    queryKey: sellerOrderKeys.detail(orderId),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/sellers/me/orders/{orderId}', {
        signal,
        params: { path: { orderId } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useShipOrder(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation<SellerOrderDetail, ProblemDetail, string>({
    mutationFn: async (trackingNumber) => {
      const { data, error } = await apiClient.POST('/sellers/me/orders/{orderId}/ship', {
        params: { path: { orderId } },
        body: { trackingNumber },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sellerOrderKeys.detail(orderId) })
      queryClient.invalidateQueries({ queryKey: sellerOrderKeys.all })
    },
  })
}
