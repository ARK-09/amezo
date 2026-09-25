import { useCartOffers } from '@/features/cart/api/useCartOffers'
import { useCart } from '@/features/cart/context/CartContext'
import type { CartLine, VariantOffer } from '@/features/cart/schema/types'

export interface EnrichedCartLine {
  line: CartLine
  offer: VariantOffer
}

/**
 * One fetch, shared by OrderSummary (display) and the Checkout page (the
 * submit payload) - both need the exact same offer data, and fetching it
 * twice risks the summary and the submitted lines disagreeing with each
 * other between renders.
 */
export function useCheckoutCart() {
  const { lines, clear } = useCart()
  const variantIds = lines.map((line) => line.variantId)
  const query = useCartOffers(variantIds, true)

  const offersById = new Map((query.data ?? []).map((offer) => [offer.id, offer]))
  const enrichedLines: EnrichedCartLine[] = lines.flatMap((line) => {
    const offer = offersById.get(line.variantId)
    return offer ? [{ line, offer }] : []
  })

  const total = enrichedLines.reduce((sum, { line, offer }) => sum + offer.price * line.quantity, 0)

  return {
    rawLines: lines,
    enrichedLines,
    total,
    isLoading: query.isLoading,
    isError: query.isError,
    // Passed on so the summary can describe a cold start instead of blaming
    // the cart items - see OrderSummary.
    error: query.error,
    clearCart: clear,
  }
}
