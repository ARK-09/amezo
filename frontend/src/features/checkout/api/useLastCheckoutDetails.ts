import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

export type LastCheckoutDetails = components['schemas']['LastCheckoutDetails']

export const checkoutKeys = {
  lastDetails: ['checkout', 'last-details'] as const,
}

/**
 * What the signed-in buyer last checked out with, for prefilling the form.
 *
 * `null` is the ordinary answer for a first-time buyer, and is returned rather than
 * thrown: the endpoint answers 204 for "no previous order", which is not a failure
 * and must not put the form into an error state. A 401 resolves to null too - a
 * guest simply has nothing to prefill, and is not asked to sign in over it.
 *
 * `enabled` keeps a signed-out visitor from calling a buyer-only route at all, so
 * guest checkout costs no extra request and logs no 401 on the way through.
 */
export function useLastCheckoutDetails(enabled: boolean) {
  return useQuery<LastCheckoutDetails | null, ProblemDetail>({
    queryKey: checkoutKeys.lastDetails,
    enabled,
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET('/checkout/last-details', { signal })
      if (response.status === 204 || response.status === 401) return null
      if (error) throw error
      return data ?? null
    },
    // An address changes about never within a visit, and this is only ever read to
    // seed a form. Refetching it mid-checkout could only fight what the buyer is
    // typing.
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
