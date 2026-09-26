import type { components } from '@/lib/api/schema'

type StoreProfile = components['schemas']['StoreProfile']

/**
 * The store's id. Shared with fixtures/stores.ts and with the StoreRef the
 * catalogue hangs on each product, so the public storefront is this same store
 * seen from outside rather than a second one that happens to look like it.
 */
export const STORE_PROFILE_ID = '99999999-9999-9999-9999-999999999999'

/**
 * The seller's store profile for local development and tests.
 *
 * /api/v1/sellers/me/store does not exist on the backend yet - there is no
 * store_profile table at all. See docs/backend-handoff.md.
 */
const SEED: StoreProfile = {
  id: STORE_PROFILE_ID,
  name: 'Aurora Audio',
  handle: 'aurora-audio',
  tagline: 'Small-batch listening gear, built to be repaired.',
  location: 'Portland, OR',
  foundedYear: 2019,
  supportEmail: 'hello@auroraaudio.com',
  about:
    'Aurora Audio is a seven-person shop making over-ear headphones, earbuds and desktop speakers. Every driver is matched by hand, and every model ships with replaceable pads, cables and batteries so it stays in service long after the warranty ends.',
  coverUrl: null,
  logoUrl: null,
  status: 'OPEN',
  vacationNote: null,
  updatedAt: '2026-09-20T09:00:00Z',
}

/** Handles another seller already holds, so the 409 path is reachable. */
export const TAKEN_HANDLES = ['northwind-vinyl', 'cedar-and-cloth']

let store: StoreProfile = structuredClone(SEED)

export function resetStoreProfile(seed: StoreProfile = structuredClone(SEED)) {
  store = seed
}

export function getStoreProfile(): StoreProfile {
  return store
}

export function patchStoreProfile(patch: Partial<StoreProfile>): StoreProfile {
  store = { ...store, ...patch, updatedAt: new Date().toISOString() }
  return store
}
