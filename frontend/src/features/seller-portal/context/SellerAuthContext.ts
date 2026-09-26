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
 * The same flag, for chrome that renders on the buyer side. Returns `null`
 * instead of throwing when there is no provider: the buyer header and footer
 * only want to know whether a seller is signed in, and a test that mounts one
 * of them without the portal's provider is asking a fair question - the answer
 * is "no seller", not a crash. The real app wraps everything in
 * `SellerAuthProvider` (App.tsx), so in production this is never null.
 */
export function useOptionalSellerAuth() {
  return useContext(SellerAuthContext)
}
