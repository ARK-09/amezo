import { useCartActions } from '@/features/cart/context/CartContext'

/**
 * Adding to the cart is a reducer dispatch and nothing else - the cart lives in
 * localStorage, so there is no request to wait for and no pending state to
 * report. isPending is kept at a literal false so callers that render a spinner
 * keep compiling; it never becomes true.
 *
 * Subscribes to actions only, so a card holding this hook doesn't re-render when
 * the cart changes.
 */
export function useAddToCart() {
  const { addLine } = useCartActions()

  function addToCart(variantId: string, quantity: number, price: number) {
    addLine(variantId, quantity, price)
  }

  return { addToCart, isPending: false }
}
