import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { buyerOrderKeys } from '@/features/orders/api/useBuyerOrders'
import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components, operations } from '@/lib/api/schema'

export type RefundRequestSummary = components['schemas']['RefundRequestSummary']
export type RefundRequestDetail = components['schemas']['RefundRequestDetail']
export type RefundStatus = components['schemas']['RefundStatus']
export type RefundResolution = components['schemas']['RefundResolution']
export type RefundPayout = components['schemas']['RefundPayout']
export type CreateRefundRequest = components['schemas']['CreateRefundRequest']
export type UpdateRefundRequest = components['schemas']['UpdateRefundRequest']
type RefundRequestPage = components['schemas']['RefundRequestPage']

type BuyerRefundFilters = NonNullable<operations['listBuyerRefundRequests']['parameters']['query']>
export type SellerRefundFilters = NonNullable<
  operations['sellerListRefundRequests']['parameters']['query']
>

export const refundKeys = {
  all: ['refund-requests'] as const,
  buyerList: (filters: BuyerRefundFilters) => [...refundKeys.all, 'buyer', filters] as const,
  sellerList: (filters: SellerRefundFilters) => [...refundKeys.all, 'seller', filters] as const,
  detail: (id: string) => [...refundKeys.all, 'detail', id] as const,
}

export function useBuyerRefundRequests(filters: BuyerRefundFilters = {}) {
  return useQuery<RefundRequestPage, ProblemDetail>({
    queryKey: refundKeys.buyerList(filters),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/refund-requests', {
        signal,
        params: { query: filters },
      })
      if (error) throw error
      return data
    },
    placeholderData: keepPreviousData,
  })
}

export function useSellerRefundRequests(filters: SellerRefundFilters) {
  return useQuery<RefundRequestPage, ProblemDetail>({
    queryKey: refundKeys.sellerList(filters),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/refund-requests', {
        signal,
        params: { query: filters },
      })
      if (error) throw error
      return data
    },
    placeholderData: keepPreviousData,
  })
}

export function useRefundRequest(refundRequestId: string | undefined) {
  return useQuery<RefundRequestDetail, ProblemDetail>({
    queryKey: refundKeys.detail(refundRequestId ?? ''),
    enabled: Boolean(refundRequestId),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/refund-requests/{refundRequestId}', {
        signal,
        params: { path: { refundRequestId: refundRequestId! } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useCreateRefundRequest() {
  const queryClient = useQueryClient()
  return useMutation<RefundRequestDetail, ProblemDetail, CreateRefundRequest>({
    mutationFn: async (body) => {
      const { data, error } = await apiClient.POST('/api/v1/refund-requests', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: refundKeys.all })
      // The order now carries an open request, which its rows and detail show.
      queryClient.invalidateQueries({ queryKey: buyerOrderKeys.all })
    },
  })
}

/**
 * The whole refund state machine. The seller approves, declines, marks a return
 * received, refunds or ships a replacement; the buyer may only cancel, and only
 * while the request is still REQUESTED. The server is what enforces that - this
 * just carries the transition it was asked for and surfaces the 409 when the
 * transition is not legal from the current state.
 */
export function useUpdateRefundRequest(refundRequestId: string) {
  const queryClient = useQueryClient()
  return useMutation<RefundRequestDetail, ProblemDetail, UpdateRefundRequest>({
    mutationFn: async (body) => {
      const { data, error } = await apiClient.PATCH('/api/v1/refund-requests/{refundRequestId}', {
        params: { path: { refundRequestId } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(refundKeys.detail(refundRequestId), updated)
      queryClient.invalidateQueries({ queryKey: refundKeys.all })
      queryClient.invalidateQueries({ queryKey: buyerOrderKeys.all })
    },
  })
}
