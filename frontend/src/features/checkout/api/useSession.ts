import { useQuery } from '@tanstack/react-query'

interface SessionIdentity {
  identityType: 'buyer' | 'seller'
  identityId: string
  email: string
  fullName: string
  expiresAt: string
}

/**
 * Minimal best-effort stand-in for a not-yet-built magic-link auth feature
 * (see docs/api-design.md's GET /sessions/current) - the only consumer
 * right now is pre-filling the checkout email. Raw fetch, not the typed
 * apiClient: /sessions/current isn't in openapi/fixture.yaml, since
 * building a whole typed contract entry for one field of an unbuilt
 * feature would be its own scope creep beyond checkout. Any failure
 * (401, network error, or simply no backend route yet) is treated the
 * same as "no session" - there's no error state to show for this.
 */
export function useSession() {
  return useQuery<SessionIdentity | null>({
    queryKey: ['session', 'current'],
    queryFn: async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
        const response = await fetch(`${baseUrl}/sessions/current`, { credentials: 'include' })
        if (!response.ok) return null
        return (await response.json()) as SessionIdentity
      } catch {
        return null
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
