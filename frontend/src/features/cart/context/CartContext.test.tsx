import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CartProvider, useCart } from './CartContext'

function setup() {
  return renderHook(() => useCart(), { wrapper: CartProvider })
}

describe('CartContext', () => {
  it('starts empty and closed', () => {
    const { result } = setup()
    expect(result.current.lines).toEqual([])
    expect(result.current.itemCount).toBe(0)
    expect(result.current.isOpen).toBe(false)
  })

  it('addLine adds a new line without opening the drawer', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 2, 10))
    expect(result.current.lines).toEqual([{ variantId: 'v1', quantity: 2, priceWhenAdded: 10 }])
    expect(result.current.itemCount).toBe(2)
    expect(result.current.isOpen).toBe(false)
  })

  it('addLine on an existing variant increments rather than duplicating', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 1, 10))
    act(() => result.current.addLine('v1', 2, 12))
    expect(result.current.lines).toEqual([{ variantId: 'v1', quantity: 3, priceWhenAdded: 12 }])
  })

  it('persists lines to localStorage as they change', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 1, 10))
    expect(JSON.parse(localStorage.getItem('cart:v1')!)).toEqual([
      { variantId: 'v1', quantity: 1, priceWhenAdded: 10 },
    ])
  })

  it('loads persisted lines on mount', () => {
    localStorage.setItem('cart:v1', JSON.stringify([{ variantId: 'v1', quantity: 5, priceWhenAdded: 20 }]))
    const { result } = setup()
    expect(result.current.lines).toEqual([{ variantId: 'v1', quantity: 5, priceWhenAdded: 20 }])
    expect(result.current.itemCount).toBe(5)
  })

  it('removeLine removes only the matching line', () => {
    const { result } = setup()
    act(() => {
      result.current.addLine('v1', 1, 10)
      result.current.addLine('v2', 1, 5)
    })
    act(() => result.current.removeLine('v1'))
    expect(result.current.lines).toEqual([{ variantId: 'v2', quantity: 1, priceWhenAdded: 5 }])
  })

  it('clear empties the cart', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 1, 10))
    act(() => result.current.clear())
    expect(result.current.lines).toEqual([])
    expect(result.current.itemCount).toBe(0)
  })

  it('close sets isOpen to false', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 1, 10))
    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
  })

  it('throws when used outside a CartProvider', () => {
    expect(() => renderHook(() => useCart())).toThrow('useCart must be used within a CartProvider')
  })

  it('picks up cart changes written by another tab via the storage event', async () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 1, 10))

    localStorage.setItem('cart:v1', JSON.stringify([{ variantId: 'v9', quantity: 4, priceWhenAdded: 1 }]))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'cart:v1' }))
    })

    await waitFor(() =>
      expect(result.current.lines).toEqual([{ variantId: 'v9', quantity: 4, priceWhenAdded: 1 }]),
    )
  })
})
