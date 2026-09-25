import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import type { ReactNode } from 'react'

import { loadCart, saveCart, STORAGE_KEY } from '../storage'
import { cartReducer } from './cartReducer'

interface CartState {
  lines: ReturnType<typeof loadCart>
  itemCount: number
  isOpen: boolean
}

interface CartActions {
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
const CartStateContext = createContext<CartState | null>(null)
const CartActionsContext = createContext<CartActions | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, undefined, loadCart)
  const [isOpen, setIsOpen] = useState(false)

  // After the render that changed them, never during it: the click that adds a
  // line paints first and the write to localStorage lands afterwards.
  useEffect(() => {
    saveCart(lines)
  }, [lines])

  // ponytail: storage events only fire in OTHER tabs/documents, never the
  // one that made the write, so this can't loop with the persistence effect above.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        dispatch({ type: 'REPLACE', lines: loadCart() })
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const itemCount = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines])

  const state = useMemo<CartState>(() => ({ lines, itemCount, isOpen }), [lines, itemCount, isOpen])

  // dispatch and setIsOpen are stable, so this is built once and the identity of
  // every callback below holds for the life of the provider.
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const actions = useMemo<CartActions>(
    () => ({
      open,
      close,
      addLine: (variantId, quantity, price) => dispatch({ type: 'ADD', variantId, quantity, price }),
      setQuantity: (variantId, quantity) => dispatch({ type: 'SET_QUANTITY', variantId, quantity }),
      removeLine: (variantId) => dispatch({ type: 'REMOVE', variantId }),
      clear: () => dispatch({ type: 'CLEAR' }),
      acknowledgePrice: (variantId, price) => dispatch({ type: 'ACKNOWLEDGE_PRICE', variantId, price }),
    }),
    [open, close],
  )

  return (
    <CartActionsContext.Provider value={actions}>
      <CartStateContext.Provider value={state}>{children}</CartStateContext.Provider>
    </CartActionsContext.Provider>
  )
}

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
