import { useOptionalSellerAuth } from '@/features/seller-portal/context/SellerAuthContext'

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
 * Two sources, because a seller can be signed in without a server session: in
 * demo mode the portal keeps its own local flag and never sets a cookie. A real
 * cookie wins over that flag, so a buyer cookie beside a stale seller flag is
 * treated as the buyer it is.
 *
 * `isPending` is the session query still in flight. Chrome can ignore it - the
 * signed-out branch is the right thing to show for the moment it takes - but a
 * page that would otherwise fire a request or redirect should wait for it.
 */
export function useViewerRole(): { role: ViewerRole; isPending: boolean } {
  const session = useSession()
  const sellerAuth = useOptionalSellerAuth()
  const identity = session.data?.identityType

  const role: ViewerRole =
    identity === 'SELLER'
      ? 'seller'
      : identity === 'BUYER'
        ? 'buyer'
        : identity == null && sellerAuth?.seller
          ? 'seller'
          : 'visitor'

  return { role, isPending: session.isPending }
}
