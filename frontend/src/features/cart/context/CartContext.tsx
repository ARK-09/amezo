import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import type { ReactNode } from 'react'

import { loadCart, saveCart, STORAGE_KEY } from '../storage'
import { cartReducer } from './cartReducer'

interface CartContextValue {
  lines: ReturnType<typeof loadCart>
  itemCount: number
  isOpen: boolean
  open: () => void
  close: () => void
  addLine: (variantId: string, quantity: number, price: number) => void
  setQuantity: (variantId: string, quantity: number) => void
  removeLine: (variantId: string) => void
  clear: () => void
  acknowledgePrice: (variantId: string, price: number) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, undefined, loadCart)
  const [isOpen, setIsOpen] = useState(false)

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

  const value: CartContextValue = {
    lines,
    itemCount,
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    addLine: (variantId, quantity, price) => {
      dispatch({ type: 'ADD', variantId, quantity, price })
      setIsOpen(true)
    },
    setQuantity: (variantId, quantity) => dispatch({ type: 'SET_QUANTITY', variantId, quantity }),
    removeLine: (variantId) => dispatch({ type: 'REMOVE', variantId }),
    clear: () => dispatch({ type: 'CLEAR' }),
    acknowledgePrice: (variantId, price) => dispatch({ type: 'ACKNOWLEDGE_PRICE', variantId, price }),
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
