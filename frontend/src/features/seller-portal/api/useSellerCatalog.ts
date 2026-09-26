import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sellerOrderKeys } from '@/features/seller-portal/api/useSellerOrders'
import { sellerProductKeys } from '@/features/seller-portal/api/useSellerProducts'
import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components, operations } from '@/lib/api/schema'

export type SellerProductRow = components['schemas']['SellerProductRow']
export type SellerOrderRow = components['schemas']['SellerOrderRow']
export type SellerOrderRowDetail = components['schemas']['SellerOrderRowDetail']
export type UpdateSellerOrder = components['schemas']['UpdateSellerOrder']
export type ProductStatus = components['schemas']['ProductStatus']
type SellerProductRowPage = components['schemas']['SellerProductRowPage']
type SellerOrderRowPage = components['schemas']['SellerOrderRowPage']

export type SellerProductFilters = NonNullable<
  operations['sellerListProductsV1']['parameters']['query']
>
export type SellerOrderFilters = NonNullable<operations['sellerListOrdersV1']['parameters']['query']>

/**
 * Deliberately nested under the keys the unversioned hooks already use
 * (`['seller','products']`, `['seller','orders']`) rather than given a
 * namespace of their own. The product form and the ship action invalidate
 * those, and they have to reach these lists too - otherwise deleting a
 * product leaves it sitting on screen.
 */
export const sellerCatalogKeys = {
  products: (filters: SellerProductFilters) =>
    [...sellerProductKeys.all, 'rows', filters] as const,
  orders: (filters: SellerOrderFilters) => [...sellerOrderKeys.all, 'rows', filters] as const,
  order: (orderId: string) => [...sellerOrderKeys.detail(orderId), 'v1'] as const,
}

export function useSellerProductRows(filters: SellerProductFilters) {
  return useQuery<SellerProductRowPage, ProblemDetail>({
    queryKey: sellerCatalogKeys.products(filters),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/products', {
        signal,
        params: { query: filters },
      })
      if (error) throw error
      return data
    },
    placeholderData: keepPreviousData,
  })
}

export function useSellerOrderRows(filters: SellerOrderFilters) {
  return useQuery<SellerOrderRowPage, ProblemDetail>({
    queryKey: sellerCatalogKeys.orders(filters),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/orders', {
        signal,
        params: { query: filters },
      })
      if (error) throw error
      return data
    },
    placeholderData: keepPreviousData,
  })
}

export function useSellerOrderRow(orderId: string | undefined) {
  return useQuery<SellerOrderRowDetail, ProblemDetail>({
    queryKey: sellerCatalogKeys.order(orderId ?? ''),
    enabled: Boolean(orderId),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/orders/{orderId}', {
        signal,
        params: { path: { orderId: orderId! } },
      })
      if (error) throw error
      return data
    },
  })
}

/**
 * Advances an order along PLACED -> PACKED -> SHIPPED. Replaces the old
 * POST /sellers/me/orders/{id}/ship, which put the verb in the path; the
 * transition is now a field on the resource, and an illegal one comes back
 * as a 409 the caller shows rather than something this hook guesses at.
 */
export function useUpdateSellerOrder(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation<SellerOrderRowDetail, ProblemDetail, UpdateSellerOrder>({
    mutationFn: async (body) => {
      const { data, error } = await apiClient.PATCH('/api/v1/sellers/me/orders/{orderId}', {
        params: { path: { orderId } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(sellerCatalogKeys.order(orderId), updated)
      queryClient.invalidateQueries({ queryKey: sellerOrderKeys.all })
    },
  })
}
