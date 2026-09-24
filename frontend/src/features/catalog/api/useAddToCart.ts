import { useState } from 'react'

// Cart feature doesn't exist yet. This is the interface it will call -
// swap the body for a real mutation against the cart feature later; the
// page below only ever calls addToCart/isPending, so nothing here changes.
export function useAddToCart() {
  const [isPending, setIsPending] = useState(false)

  async function addToCart(variantId: string, quantity: number) {
    setIsPending(true)
    try {
      await Promise.resolve()
      console.info('[stub] addToCart', { variantId, quantity })
    } finally {
      setIsPending(false)
    }
  }

  return { addToCart, isPending }
}
