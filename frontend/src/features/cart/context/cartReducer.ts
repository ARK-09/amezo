import type { CartLine } from '../schema/types'

export type CartAction =
  | { type: 'ADD'; variantId: string; quantity: number; price: number }
  | { type: 'SET_QUANTITY'; variantId: string; quantity: number }
  | { type: 'REMOVE'; variantId: string }
  | { type: 'CLEAR' }
  | { type: 'ACKNOWLEDGE_PRICE'; variantId: string; price: number }

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'ADD': {
      const existing = lines.find((line) => line.variantId === action.variantId)
      if (existing) {
        return lines.map((line) =>
          line.variantId === action.variantId
            ? { ...line, quantity: line.quantity + action.quantity, priceWhenAdded: action.price }
            : line,
        )
      }
      return [...lines, { variantId: action.variantId, quantity: action.quantity, priceWhenAdded: action.price }]
    }
    case 'SET_QUANTITY':
      return lines.map((line) =>
        line.variantId === action.variantId ? { ...line, quantity: Math.max(1, action.quantity) } : line,
      )
    case 'REMOVE':
      return lines.filter((line) => line.variantId !== action.variantId)
    case 'CLEAR':
      return []
    case 'ACKNOWLEDGE_PRICE':
      return lines.map((line) =>
        line.variantId === action.variantId ? { ...line, priceWhenAdded: action.price } : line,
      )
    default:
      return lines
  }
}
