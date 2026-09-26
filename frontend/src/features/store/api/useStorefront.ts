import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'
import type { ProductSummary } from '@/features/search/schema/types'

export type PublicStore = components['schemas']['PublicStore']
export type StorePolicies = components['schemas']['StorePolicies']

export type StoreSort = 'relevance' | 'priceAsc' | 'priceDesc' | 'rating'

export type StoreProductFilters = {
  q?: string
  category?: string
  sort?: StoreSort
  page: number
  size: number
}

/**
 * Nested under the same ['store'] root the seller's own profile uses, so that
 * changing a handle in Store settings invalidates the public storefront too -
 * a renamed handle moves this page's URL.
 */
export const storefrontKeys = {
  all: ['store'] as const,
  detail: (handle: string) => ['store', 'public', handle] as const,
  products: (handle: string, filters: StoreProductFilters) =>
    ['store', 'public', handle, 'products', filters] as const,
}

/** The storefront header: cover, logo, about, policies and the stats strip. */
export function usePublicStore(handle: string | undefined) {
  return useQuery<PublicStore, ProblemDetail>({
    queryKey: storefrontKeys.detail(handle ?? ''),
    enabled: Boolean(handle),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/stores/{handle}', {
        signal,
        params: { path: { handle: handle! } },
      })
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

type ProductPage = { content: ProductSummary[]; totalElements: number; totalPages: number }

/**
 * This store's listings, filtered and paged by the server.
 *
 * It used to pull one 100-row page of the whole catalogue and match brandName in
 * the browser, which capped a storefront at whatever fitted in that page, matched
 * on a display string rather than a key, and made the page's own counts
 * disagree with the store's real totals.
 */
export function useStoreProducts(handle: string | undefined, filters: StoreProductFilters) {
  return useQuery<ProductPage, ProblemDetail>({
    queryKey: storefrontKeys.products(handle ?? '', filters),
    enabled: Boolean(handle),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/stores/{handle}/products', {
        signal,
        params: {
          path: { handle: handle! },
          query: {
            q: filters.q || undefined,
            category: filters.category || undefined,
            sort: filters.sort,
            page: filters.page,
            size: filters.size,
          },
        },
      })
      if (error) throw error
      return data as ProductPage
    },
  })
}

/**
 * Follow and unfollow, as one mutation over the desired state rather than two.
 *
 * Both verbs are idempotent server-side, so the button is free to be optimistic:
 * it flips immediately and rolls back if the request fails, which is the only way
 * a toggle feels like a toggle rather than a form submission.
 */
export function useFollowStore(handle: string | undefined) {
  const queryClient = useQueryClient()
  const key = storefrontKeys.detail(handle ?? '')

  return useMutation<void, ProblemDetail, boolean, { previous?: PublicStore }>({
    mutationFn: async (following) => {
      const request = following ? apiClient.PUT : apiClient.DELETE
      const { error } = await request('/api/v1/stores/{handle}/follow', {
        params: { path: { handle: handle! } },
      })
      if (error) throw error
    },
    onMutate: async (following) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<PublicStore>(key)
      if (previous) queryClient.setQueryData<PublicStore>(key, { ...previous, following })
      return { previous }
    },
    onError: (_error, _following, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    // The server owns the follower-derived figures, so settle on its answer.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export type StoreMessage = { subject?: string; body: string }

/** Sends the seller a question. Accepted for delivery, not answered inline. */
export function useMessageStore(handle: string | undefined) {
  return useMutation<void, ProblemDetail, StoreMessage>({
    mutationFn: async (message) => {
      const { error } = await apiClient.POST('/api/v1/stores/{handle}/messages', {
        params: { path: { handle: handle! } },
        body: message,
      })
      if (error) throw error
    },
  })
}
