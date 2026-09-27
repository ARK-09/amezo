import { useMutation } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

type SellerSession = components['schemas']['SellerSession']

/**
 * Resolves to a token for the configured demo address and to null for every other
 * one - see useRequestBuyerMagicLink and the backend's identity/DemoAccount. The
 * sign-in screen redeems a token it is given instead of telling the reader to go and
 * find an email that was never sent.
 */
export function useRequestMagicLink() {
  return useMutation<string | null, ProblemDetail, string>({
    mutationFn: async (email) => {
      const { data, error } = await apiClient.POST('/auth/seller/magic-link', {
        body: { email },
      })
      if (error) throw error
      return data.token ?? null
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
