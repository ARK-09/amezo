import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { resetDeliveryCountryForTests } from '@/features/reference/deliveryCountry'

import { server } from './msw/server'
import { clearLastCheckoutDetails } from './msw/fixtures/checkoutDetails'
import { resetWrittenReviews } from './msw/fixtures/productDetails'
import { resetPurchases } from './msw/fixtures/purchases'
import { clearSellerSession } from './msw/fixtures/sellerAuth'
import { resetSellerOrders } from './msw/fixtures/sellerOrders'
import { resetRefundRequests } from './msw/fixtures/refunds'
import { resetSellerProducts } from './msw/fixtures/sellerProducts'
import { resetStoreProfile } from './msw/fixtures/storeProfile'

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
afterEach(() => resetRefundRequests())
afterEach(() => resetStoreProfile())
afterEach(() => resetSellerOrders())
// The mock session cookie is module state like the rest; a test that signs in
// must not leave the next one signed in.
afterEach(() => clearSellerSession())
// Reviews written by a test, and the purchases that allowed them, are module state
// like the rest - a leftover review would make the next test's product look reviewed.
afterEach(() => resetWrittenReviews())
afterEach(() => resetPurchases())
// Same reasoning for the delivery-country preference and the stored last order:
// both are module/browser state that would otherwise leak a prefilled checkout
// form into the next test.
afterEach(() => clearLastCheckoutDetails())
afterEach(() => resetDeliveryCountryForTests())
afterAll(() => server.close())
