import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'

import { sessionKeys, useSession } from '@/features/session/api/useSession'

import { SellerAuthContext, type SellerSession } from './SellerAuthContext'

/**
 * Who the portal thinks is signed in, derived from the ONE session the server
 * knows about: GET /sessions/current, behind the mp_session cookie.
 *
 * <h2>There is no second copy of this any more</h2>
 *
 * This provider used to keep its own flag in localStorage, written by a sign-in
 * bypass (VITE_DEMO_SELLER_AUTH) that minted a client-side session - a random UUID
 * and an email, with no cookie behind it - so the Vercel demo could show the portal
 * without a backend. The whole app read that flag: useViewerRole treated it as a
 * signed-in seller, which is how the LANDING PAGE came to show an authenticated
 * experience off a session the server had never heard of.
 *
 * The backend implements the real flow now, so the bypass and the flag are both
 * gone. What is left is one query, one cookie, and a context that reads it - which
 * is also why signIn and signOut write to the session cache rather than to a store
 * of their own: they are telling the app something the server has just told them,
 * not keeping a second opinion.
 */
export function SellerAuthProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const identity = session.data

  // A seller, or nobody. A BUYER cookie is not a seller - the portal's own guard
  // sends them to sign in rather than showing them a shop they do not have.
  const sellerId = identity?.identityType === 'SELLER' ? identity.identityId : null
  const email = identity?.identityType === 'SELLER' ? identity.email : null

  useEffect(() => {
    /**
     * Any API call answering 401 means the cookie is gone or expired. The session
     * query is the thing that would otherwise find that out on its next refetch -
     * up to five minutes later - so this tells it now. Writing null rather than
     * invalidating: we know the answer, and an invalidate would leave the old
     * identity in place until a request came back.
     */
    function onUnauthorized() {
      queryClient.setQueryData(sessionKeys.current, null)
    }
    window.addEventListener('api:unauthorized', onUnauthorized)
    return () => window.removeEventListener('api:unauthorized', onUnauthorized)
  }, [queryClient])

  const value = useMemo(() => {
    const seller: SellerSession | null = sellerId && email ? { sellerId, email } : null

    return {
      seller,
      /**
       * Nobody has answered yet. In flight on a cold load, or errored because the
       * instance is asleep and every retry came back 502 - which is the server
       * failing to speak, not the server saying the session is gone. Only a 401 is
       * that, and useSession turns it into a successful `null`. See
       * SellerPortalLayout for what waits on this.
       */
      isUnknown: session.isPending || session.isError,

      /**
       * Called by the verify screen with what the server just returned. That IS the
       * session, so it is written straight into the query rather than kept beside
       * it; the invalidate that follows lets the server confirm it in its own time.
       */
      signIn: (next: SellerSession) => {
        queryClient.setQueryData(sessionKeys.current, {
          identityType: 'SELLER' as const,
          identityId: next.sellerId,
          email: next.email,
        })
        void queryClient.invalidateQueries({ queryKey: sessionKeys.current })
      },

      /** The cookie has just been revoked, so we know the answer without asking. */
      signOut: () => {
        queryClient.setQueryData(sessionKeys.current, null)
      },
    }
  }, [sellerId, email, session.isPending, session.isError, queryClient])

  return <SellerAuthContext.Provider value={value}>{children}</SellerAuthContext.Provider>
}
