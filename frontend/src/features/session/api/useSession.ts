import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

export type SessionIdentity = components['schemas']['SessionIdentity']

export const sessionKeys = {
  current: ['session', 'current'] as const,
}

/**
 * Who, if anyone, the session cookie belongs to. Lives outside any one feature
 * because three things now read it: the buyer header ("signed in as"), the
 * checkout email pre-fill, and the seller portal, which uses it to find out on
 * boot whether the cookie it has is still good.
 *
 * `null` means nobody is signed in, and that is a successful answer, not a
 * failure: 401 is exactly what GET /sessions/current returns for a visitor with
 * no cookie or an expired one, so it resolves rather than throwing, and the
 * query never retries it. Everything else does throw, which is the point - a
 * cold-started backend that answers 502 gets retried by the client's default
 * policy instead of being silently reported as "not signed in".
 *
 * (It used to swallow every failure, including "the route doesn't exist yet".
 * The route exists now: SessionController on the backend.)
 */
export function useSession() {
  return useQuery<SessionIdentity | null, ProblemDetail>({
    queryKey: sessionKeys.current,
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET('/sessions/current', { signal })
      if (response.status === 401) return null
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
