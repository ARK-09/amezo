import { describe, expect, it } from 'vitest'

import { cartReducer } from './cartReducer'
import type { CartLine } from '../schema/types'

describe('cartReducer', () => {
  it('ADD appends a new line', () => {
    const result = cartReducer([], { type: 'ADD', variantId: 'v1', quantity: 2, price: 10 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 2, priceWhenAdded: 10 }])
  })

  it('ADD on an existing variant increments quantity instead of duplicating', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'ADD', variantId: 'v1', quantity: 2, price: 10 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 3, priceWhenAdded: 10 }])
  })

  it('ADD on an existing variant refreshes the price baseline to the price just used', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'ADD', variantId: 'v1', quantity: 1, price: 12 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 2, priceWhenAdded: 12 }])
  })

  it('ADD does not affect other lines', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'ADD', variantId: 'v2', quantity: 1, price: 5 })
    expect(result).toEqual([
      { variantId: 'v1', quantity: 1, priceWhenAdded: 10 },
      { variantId: 'v2', quantity: 1, priceWhenAdded: 5 },
    ])
  })

  it('SET_QUANTITY updates only the matching line', () => {
    const initial: CartLine[] = [
      { variantId: 'v1', quantity: 1, priceWhenAdded: 10 },
      { variantId: 'v2', quantity: 1, priceWhenAdded: 5 },
    ]
    const result = cartReducer(initial, { type: 'SET_QUANTITY', variantId: 'v1', quantity: 4 })
    expect(result).toEqual([
      { variantId: 'v1', quantity: 4, priceWhenAdded: 10 },
      { variantId: 'v2', quantity: 1, priceWhenAdded: 5 },
    ])
  })

  it('SET_QUANTITY clamps to a minimum of 1', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 3, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'SET_QUANTITY', variantId: 'v1', quantity: 0 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }])
  })

  it('REMOVE drops only the matching line', () => {
    const initial: CartLine[] = [
      { variantId: 'v1', quantity: 1, priceWhenAdded: 10 },
      { variantId: 'v2', quantity: 1, priceWhenAdded: 5 },
    ]
    const result = cartReducer(initial, { type: 'REMOVE', variantId: 'v1' })
    expect(result).toEqual([{ variantId: 'v2', quantity: 1, priceWhenAdded: 5 }])
  })

  it('CLEAR empties the cart', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }]
    expect(cartReducer(initial, { type: 'CLEAR' })).toEqual([])
  })

  it('ACKNOWLEDGE_PRICE updates the baseline without changing quantity', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 3, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'ACKNOWLEDGE_PRICE', variantId: 'v1', price: 15 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 3, priceWhenAdded: 15 }])
  })

  it('REPLACE sets the lines to exactly the given array, discarding what was there before', () => {
    const initial: CartLine[] = [
      { variantId: 'v1', quantity: 1, priceWhenAdded: 10 },
      { variantId: 'v2', quantity: 1, priceWhenAdded: 5 },
    ]
    const replacement: CartLine[] = [{ variantId: 'v9', quantity: 4, priceWhenAdded: 1 }]
    const result = cartReducer(initial, { type: 'REPLACE', lines: replacement })
    expect(result).toEqual(replacement)
  })
})
