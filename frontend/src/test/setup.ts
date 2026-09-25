import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './msw/server'
import { clearSellerSession } from './msw/fixtures/sellerAuth'
import { resetSellerOrders } from './msw/fixtures/sellerOrders'
import { resetSellerProducts } from './msw/fixtures/sellerProducts'

// jsdom doesn't implement ResizeObserver; radix-ui's Slider needs it to measure the track
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// jsdom doesn't implement these either; radix-ui's Select calls them when opening/scrolling to an item
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterEach(() => localStorage.clear())
afterEach(() => resetSellerProducts())
afterEach(() => resetSellerOrders())
// The mock session cookie is module state like the rest; a test that signs in
// must not leave the next one signed in.
afterEach(() => clearSellerSession())
afterAll(() => server.close())
