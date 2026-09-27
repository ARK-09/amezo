import { useSession } from './useSession'

export type ViewerRole = 'seller' | 'buyer' | 'visitor'

/**
 * Which sides of the marketplace the person browsing is on.
 *
 * <h2>Both, possibly</h2>
 *
 * This used to answer one of three values, read off `identityType`, because a person
 * was one of three things: Amezo kept buyers and sellers in separate tables and there
 * is one session cookie, so signing into the portal ended the buyer session outright.
 * The backend joins them now - one verified email address is one account, and its
 * session carries the roles of whichever halves exist (GET /sessions/current returns
 * `buyerIdentityId` and `sellerId` for exactly this).
 *
 * So `isSeller` and `isBuyer` are separate questions and both can be true. Read those.
 * `role` remains for the chrome that genuinely has to pick ONE thing to show, and it
 * prefers seller because that is the more specific place to send someone who has a
 * shop - but code that used it to conclude "seller, therefore not a buyer" is the bug
 * this replaces: it hid My Orders from people who had orders.
 *
 * ONE source, still: the session the server knows about.
 *
 * `isPending` is the session query still in flight. Chrome can ignore it - the
 * signed-out branch is the right thing to show for the moment it takes - but a
 * page that would otherwise fire a request or redirect should wait for it.
 */
export function useViewerRole(): {
  role: ViewerRole
  isSeller: boolean
  isBuyer: boolean
  isPending: boolean
} {
  const session = useSession()
  const identity = session.data

  // The ids, not identityType: they are what the server's own buyer- and
  // seller-scoped routes act as, so a screen that branches on them cannot offer a
  // page the API will then refuse.
  const isSeller = identity?.sellerId != null
  const isBuyer = identity?.buyerIdentityId != null

  const role: ViewerRole = isSeller ? 'seller' : isBuyer ? 'buyer' : 'visitor'

  return { role, isSeller, isBuyer, isPending: session.isPending }
}
