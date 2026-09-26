import { createContext, useContext } from 'react'

import type { CartLine } from '../schema/types'

/**
 * The two contexts, their shapes and their readers - everything about the cart
 * except the provider, which lives in `CartProvider.tsx`.
 *
 * Split out because a file that exports both a component and the hooks beside
 * it breaks fast refresh (react/only-export-components): editing a hook would
 * remount the provider and empty the shopper's cart on every save. Same shape
 * as `cartReducer.ts` beside it, and as the seller auth pair.
 */

export interface CartState {
  lines: CartLine[]
  itemCount: number
  isOpen: boolean
}

export interface CartActions {
  open: () => void
  close: () => void
  addLine: (variantId: string, quantity: number, price: number) => void
  setQuantity: (variantId: string, quantity: number) => void
  removeLine: (variantId: string) => void
  clear: () => void
  acknowledgePrice: (variantId: string, price: number) => void
}

/**
 * State and actions are two contexts on purpose. Every action is stable for the
 * provider's whole life, so a component that only dispatches - a product card's
 * Add-to-cart button, of which a grid holds sixteen - subscribes to nothing that
 * changes and never re-renders when the cart does. Merging them, as this did
 * before, re-rendered every card on every quantity change and every time the
 * drawer opened.
 */
export const CartStateContext = createContext<CartState | null>(null)
export const CartActionsContext = createContext<CartActions | null>(null)

/** Actions only - for components that dispatch but never read the cart. */
export function useCartActions(): CartActions {
  const ctx = useContext(CartActionsContext)
  if (!ctx) throw new Error('useCartActions must be used within a CartProvider')
  return ctx
}

export function useCartState(): CartState {
  const ctx = useContext(CartStateContext)
  if (!ctx) throw new Error('useCartState must be used within a CartProvider')
  return ctx
}

/**
 * Both halves, for components that genuinely read and write. Reads the contexts
 * itself rather than calling the two hooks above, so the error names the hook the
 * caller actually used instead of an internal one.
 */
export function useCart(): CartState & CartActions {
  const state = useContext(CartStateContext)
  const actions = useContext(CartActionsContext)
  if (!state || !actions) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return { ...state, ...actions }
}
