import { useSession } from './useSession'

export type ViewerRole = 'seller' | 'buyer' | 'visitor'

/**
 * Which side of the marketplace the person browsing is on.
 *
 * Amezo signs sellers and buyers in separately, and buyer-side screens used to
 * assume that anyone signed in was a buyer. That showed a seller a "Sell on
 * Amezo" pitch in the header and footer, an account page linking to an order
 * history they cannot have, and - worst - an orders page that fired a buyer-only
 * request and reported the resulting 401 as "Session is missing, expired, or
 * invalid" about a session that was perfectly valid.
 *
 * ONE source: the session the server knows about. It used to have two, because
 * the portal's demo sign-in bypass minted a seller with no cookie behind it and
 * this had to report that as a signed-in seller - which is how the landing page
 * came to show an authenticated experience off a fabricated session. The bypass is
 * gone and so is the second source.
 *
 * `isPending` is the session query still in flight. Chrome can ignore it - the
 * signed-out branch is the right thing to show for the moment it takes - but a
 * page that would otherwise fire a request or redirect should wait for it.
 */
export function useViewerRole(): { role: ViewerRole; isPending: boolean } {
  const session = useSession()
  const identity = session.data?.identityType

  const role: ViewerRole =
    identity === 'SELLER' ? 'seller' : identity === 'BUYER' ? 'buyer' : 'visitor'

  return { role, isPending: session.isPending }
}
