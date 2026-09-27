import { createContext, useContext } from 'react'

/**
 * The context itself, its shape and its readers - everything about seller auth
 * except the provider, which lives in `SellerAuthProvider.tsx`.
 *
 * Split out because a file that exports both a component and the hooks beside
 * it breaks fast refresh (react/only-export-components): editing a hook would
 * remount the provider and, with it, every seller session in the tree. Same
 * reason `cartReducer.ts` sits beside `CartContext.tsx`.
 */

export interface SellerSession {
  sellerId: string
  email: string
}

export interface SellerAuthContextValue {
  seller: SellerSession | null
  /**
   * The server has not told us who this is - the request is still in flight, or it
   * failed. NOT the same as "no seller", and the difference matters twice:
   *
   *  - on a cold load, treating "not answered yet" as signed out bounces every
   *    seller to the sign-in page for the second it takes to answer;
   *  - when the instance is asleep, a 502 is the server failing to speak, not the
   *    server saying the session is gone. Only a 401 means that.
   *
   * A screen that would redirect on `seller === null` has to wait for this first.
   */
  isUnknown: boolean
  signIn: (session: SellerSession) => void
  signOut: () => void
}

export const SellerAuthContext = createContext<SellerAuthContextValue | null>(null)

export function useSellerAuth() {
  const ctx = useContext(SellerAuthContext)
  if (!ctx) throw new Error('useSellerAuth must be used within a SellerAuthProvider')
  return ctx
}

/**
 * The same value, for chrome that renders outside the portal. Returns `null`
 * instead of throwing when there is no provider: a test that mounts the buyer
 * header without the portal's provider is asking a fair question, and the answer
 * is "no seller", not a crash. The real app wraps everything in
 * `SellerAuthProvider` (App.tsx), so in production this is never null.
 *
 * Nothing reads it today. useViewerRole did, as the one caller that needed to see
 * a seller with no server session - which only happened under the demo sign-in
 * bypass. That bypass is gone, so the role comes from the session alone.
 */
export function useOptionalSellerAuth() {
  return useContext(SellerAuthContext)
}
