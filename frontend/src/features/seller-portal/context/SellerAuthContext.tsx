import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

const STORAGE_KEY = 'seller:session'

export interface SellerSession {
  sellerId: string
  email: string
}

interface SellerAuthContextValue {
  seller: SellerSession | null
  signIn: (session: SellerSession) => void
  signOut: () => void
}

const SellerAuthContext = createContext<SellerAuthContextValue | null>(null)

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

  useEffect(() => {
    // The server-side cookie session is the real guard - this local flag is
    // only for UX (showing the email, skipping a flash of protected
    // content). If any API call 401s, the cookie is gone/expired, so drop
    // the local flag too and let the route guard redirect to sign-in.
    function onUnauthorized() {
      setSeller(null)
    }
    window.addEventListener('api:unauthorized', onUnauthorized)
    return () => window.removeEventListener('api:unauthorized', onUnauthorized)
  }, [])

  function signIn(session: SellerSession) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    setSeller(session)
  }

  function signOut() {
    localStorage.removeItem(STORAGE_KEY)
    setSeller(null)
  }

  return (
    <SellerAuthContext.Provider value={{ seller, signIn, signOut }}>{children}</SellerAuthContext.Provider>
  )
}

export function useSellerAuth() {
  const ctx = useContext(SellerAuthContext)
  if (!ctx) throw new Error('useSellerAuth must be used within a SellerAuthProvider')
  return ctx
}
