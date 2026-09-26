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

/**
 * Signs out whoever is signed in, from anywhere in the buyer app.
 *
 * Calls DELETE /sessions/current, not DELETE /auth/buyer/session. The buyer-scoped
 * route is what made sign-out look broken on /account: that page is reachable by a
 * seller session too, the route is hasRole("BUYER"), so a signed-in seller got a 403,
 * this mutation rejected, and nothing on screen changed. The role-agnostic route
 * revokes whichever session the cookie names.
 *
 * Clearing the cached identity is what evicts the persisted seller flag as well:
 * SellerAuthProvider wraps the whole app and already drops localStorage when the
 * session query resolves to null, so there is one place that owns that, not two.
 */
export function useBuyerSignOut() {
  const queryClient = useQueryClient()

  return useMutation<void, ProblemDetail, void>({
    mutationFn: async () => {
      const { error } = await apiClient.DELETE('/sessions/current')
      if (error) throw error
    },
    onSuccess: () => {
      // Known without asking: the cookie has just been revoked.
      queryClient.setQueryData(sessionKeys.current, null)
      // Anything scoped to the person who just left. Removed rather than
      // invalidated: invalidating refetches it, which on a shared machine means
      // asking the server for the previous buyer's data a moment after they signed
      // out. The catalog and the reference lists are nobody's in particular and stay.
      queryClient.removeQueries({ queryKey: ['reviews'] })
      queryClient.removeQueries({ queryKey: ['checkout', 'last-details'] })
    },
  })
}
