import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

import { sessionKeys } from './useSession'

export type BuyerSession = components['schemas']['BuyerSession']

/**
 * Buyer sign-in, the same magic-link flow the seller portal uses. It exists because
 * a review has to be attributable: until now the only way to become a known buyer
 * was to place an order, which never created a session.
 */
export function useRequestBuyerMagicLink() {
  return useMutation<void, ProblemDetail, string>({
    mutationFn: async (email) => {
      const { error } = await apiClient.POST('/auth/buyer/magic-link', { body: { email } })
      if (error) throw error
    },
  })
}

export function useVerifyBuyerMagicLink() {
  const queryClient = useQueryClient()

  return useMutation<BuyerSession, ProblemDetail, string>({
    mutationFn: async (token) => {
      const { data, error } = await apiClient.POST('/auth/buyer/verify', { body: { token } })
      if (error) throw error
      return data
    },
    // The cookie is set by the response, so the cached "who am I" answer - usually a
    // null from boot - is now stale.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.current }),
  })
}

export function useBuyerSignOut() {
  const queryClient = useQueryClient()

  return useMutation<void, ProblemDetail, void>({
    mutationFn: async () => {
      const { error } = await apiClient.DELETE('/auth/buyer/session')
      if (error) throw error
    },
    onSuccess: () => {
      // Known without asking: the cookie has just been revoked.
      queryClient.setQueryData(sessionKeys.current, null)
    },
  })
}
