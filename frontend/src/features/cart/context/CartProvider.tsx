import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { ReactNode } from 'react'

import { loadCart, saveCart, STORAGE_KEY } from '../storage'
import {
  CartActionsContext,
  CartStateContext,
  type CartActions,
  type CartState,
} from './CartContext'
import { cartReducer } from './cartReducer'

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
