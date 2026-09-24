import { useMutation } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

type SellerSession = components['schemas']['SellerSession']

export function useRequestMagicLink() {
  return useMutation<void, ProblemDetail, string>({
    mutationFn: async (email) => {
      const { error } = await apiClient.POST('/auth/seller/magic-link', {
        body: { email },
      })
      if (error) throw error
    },
  })
}

export function useVerifyMagicLink() {
  return useMutation<SellerSession, ProblemDetail, string>({
    mutationFn: async (token) => {
      const { data, error } = await apiClient.POST('/auth/seller/verify', {
        body: { token },
      })
      if (error) throw error
      return data
    },
  })
}

export function useSellerSignOut() {
  return useMutation<void, ProblemDetail, void>({
    mutationFn: async () => {
      const { error } = await apiClient.DELETE('/auth/seller/session')
      if (error) throw error
    },
  })
}
