import { useCart } from '@/features/cart/context/CartContext'

export function useAddToCart() {
  const { addLine } = useCart()

  function addToCart(variantId: string, quantity: number, price: number) {
    addLine(variantId, quantity, price)
  }

  return { addToCart, isPending: false }
}
