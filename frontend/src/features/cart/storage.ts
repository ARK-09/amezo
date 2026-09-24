import type { CartLine } from './schema/types'

const STORAGE_KEY = 'cart:v1'

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Record<string, unknown>
  return (
    typeof line.variantId === 'string' &&
    typeof line.quantity === 'number' &&
    typeof line.priceWhenAdded === 'number'
  )
}

export function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCartLine)
  } catch {
    return []
  }
}

export function saveCart(lines: CartLine[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  } catch {
    // private browsing / storage disabled / quota exceeded - cart just won't persist
  }
}
