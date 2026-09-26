import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { sessionKeys, useSession } from '@/features/session/api/useSession'

import { SellerAuthContext, type SellerSession } from './SellerAuthContext'

const STORAGE_KEY = 'seller:session'

// Same bypass flag SellerSignIn and SellerPortalLayout read. Its whole point is
// a session with no cookie behind it, so server verification has to sit out -
// it would ask the API about a session that was never meant to exist and then
// sign the demo user straight back out.
const DEMO_AUTH = import.meta.env.VITE_DEMO_SELLER_AUTH === 'true'

function storeSession(session: SellerSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

/**
 * Drops the persisted flag, not just the in-memory one. Skipping the persisted
 * half is how a revoked session came back: the 401 listener below cleared state,
 * the next page load read localStorage again, and the portal rendered for a
 * seller whose cookie was long gone.
 */
function forgetStoredSession() {
  localStorage.removeItem(STORAGE_KEY)
}

function loadSession(): SellerSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as SellerSession).sellerId === 'string' &&
      typeof (parsed as SellerSession).email === 'string'
    ) {
      return parsed as SellerSession
    }
    return null
  } catch {
    return null
  }
}

export function SellerAuthProvider({ children }: { children: ReactNode }) {
  const [seller, setSeller] = useState<SellerSession | null>(loadSession)
  // Verifies the cookie against the server on boot, without blocking on it. The
  // local flag renders the portal immediately (no flash of the sign-in page),
  // and this corrects it once the answer arrives.
  const session = useSession()
  const queryClient = useQueryClient()

  const identity = session.data
  useEffect(() => {
    if (DEMO_AUTH) return

    // Nothing decided yet - still loading, or retrying a backend that hasn't
    // woken up. Keep whatever the local flag says rather than bouncing a signed
    // -in seller to the sign-in page because Render was asleep.
    if (session.isPending || session.isError) return

    if (identity?.identityType === 'SELLER') {
      // The cookie is good. Adopt it even if the local flag was missing, so a
      // cleared localStorage (or a second browser profile) doesn't force a
      // pointless second sign-in while the session is still valid.
      const confirmed: SellerSession = { sellerId: identity.identityId, email: identity.email }
      setSeller((current) => {
        if (current?.sellerId === confirmed.sellerId && current.email === confirmed.email) return current
        storeSession(confirmed)
        return confirmed
      })
      return
    }

    // identity === null: the server answered 401. Definitive - there is no
    // session, so the stale flag has to go, persisted copy included.
    forgetStoredSession()
    setSeller((current) => (current === null ? current : null))
  }, [session.isPending, session.isError, identity])

  useEffect(() => {
    // The server-side cookie session is the real guard - this local flag is
    // only for UX (showing the email, skipping a flash of protected
    // content). If any API call 401s, the cookie is gone/expired, so drop
    // the local flag too and let the route guard redirect to sign-in.
    function onUnauthorized() {
      // Except in demo mode, where there is no cookie to lose: the boot check
      // above already opts out, but this listener did not, so the 401 that
      // GET /sessions/current returns for a visitor signed the demo seller
      // straight back out again.
      if (DEMO_AUTH) return
      forgetStoredSession()
      setSeller(null)
    }
    window.addEventListener('api:unauthorized', onUnauthorized)
    return () => window.removeEventListener('api:unauthorized', onUnauthorized)
  }, [])

  function signIn(session: SellerSession) {
    storeSession(session)
    setSeller(session)
    // The cached answer is from before the cookie existed (usually a null from
    // boot). Left alone, a later remount would read that stale null and sign
    // this seller back out; re-asking the server settles it.
    void queryClient.invalidateQueries({ queryKey: sessionKeys.current })
  }

  function signOut() {
    forgetStoredSession()
    setSeller(null)
    // We know the answer without asking: the cookie has just been revoked.
    // Writing it beats invalidating, which would leave the old identity cached
    // until a refetch lands and could re-adopt it in the meantime.
    queryClient.setQueryData(sessionKeys.current, null)
  }

  return (
    <SellerAuthContext.Provider value={{ seller, signIn, signOut }}>{children}</SellerAuthContext.Provider>
  )
}
