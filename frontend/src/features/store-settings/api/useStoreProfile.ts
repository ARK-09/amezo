import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

export type StoreProfile = components['schemas']['StoreProfile']
export type UpdateStoreProfile = components['schemas']['UpdateStoreProfile']
export type StoreStatus = components['schemas']['StoreStatus']
export type PublicStore = components['schemas']['PublicStore']

export const storeKeys = {
  all: ['store'] as const,
  mine: ['store', 'me'] as const,
  public: (handle: string) => ['store', 'public', handle] as const,
}

export function useMyStore() {
  return useQuery<StoreProfile, ProblemDetail>({
    queryKey: storeKeys.mine,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/store', { signal })
      if (error) throw error
      return data
    },
  })
}

export function useUpdateMyStore() {
  const queryClient = useQueryClient()
  return useMutation<StoreProfile, ProblemDetail, UpdateStoreProfile>({
    mutationFn: async (body) => {
      const { data, error } = await apiClient.PATCH('/api/v1/sellers/me/store', { body })
      if (error) throw error
      return data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(storeKeys.mine, updated)
      // The handle may have changed, which moves the public storefront URL.
      queryClient.invalidateQueries({ queryKey: storeKeys.all })
    },
  })
}

/** The public storefront header, by handle. */
export function usePublicStore(handle: string | undefined) {
  return useQuery<PublicStore, ProblemDetail>({
    queryKey: storeKeys.public(handle ?? ''),
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
