import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadCart, saveCart } from './storage'

describe('cart storage', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty array when nothing is stored', () => {
    expect(loadCart()).toEqual([])
  })

  it('round-trips lines through localStorage', () => {
    saveCart([{ variantId: 'v1', quantity: 2, priceWhenAdded: 9.99 }])
    expect(loadCart()).toEqual([{ variantId: 'v1', quantity: 2, priceWhenAdded: 9.99 }])
  })

  it('returns an empty array for corrupt JSON instead of throwing', () => {
    localStorage.setItem('cart:v1', '{not json')
    expect(loadCart()).toEqual([])
  })

  it('drops malformed entries but keeps valid ones', () => {
    localStorage.setItem(
      'cart:v1',
      JSON.stringify([{ variantId: 'v1', quantity: 1, priceWhenAdded: 5 }, { quantity: 1 }, null]),
    )
    expect(loadCart()).toEqual([{ variantId: 'v1', quantity: 1, priceWhenAdded: 5 }])
  })

  it('does not throw when storage write fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveCart([{ variantId: 'v1', quantity: 1, priceWhenAdded: 5 }])).not.toThrow()
    spy.mockRestore()
  })
})
