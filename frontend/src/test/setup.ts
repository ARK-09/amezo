import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './msw/server'
import { resetSellerProducts } from './msw/fixtures/sellerProducts'

// jsdom doesn't implement ResizeObserver; radix-ui's Slider needs it to measure the track
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterEach(() => localStorage.clear())
afterEach(() => resetSellerProducts())
afterAll(() => server.close())
