import { useSyncExternalStore } from 'react'

/**
 * The buyer's chosen delivery country, shared by the header's "Deliver to" picker
 * and the checkout form.
 *
 * A tiny external store rather than context or a query: it is one string, it has to
 * outlive the tab, and both readers sit in completely different parts of the tree.
 * useSyncExternalStore keeps them in step within a tab, and the `storage` event
 * keeps two tabs of the same site in step with each other.
 *
 * The stored value is the ISO 3166-1 alpha-2 code, never a display name - the same
 * thing GET /countries serves, the checkout form submits and @ValidCountryCode
 * validates on the way in. The name is looked up from the country list for display,
 * so a stored code survives the list being relabelled.
 *
 * The key is versioned because it replaced a city preference ('delivery-city:v1')
 * that stored values like "Dubai". Reusing the key would have read a city name as a
 * country code and quietly put "Du" in an address.
 */
const STORAGE_KEY = 'delivery-country:v1'

const listeners = new Set<() => void>()

/**
 * Cached so getSnapshot returns a stable value between writes.
 * useSyncExternalStore re-reads on every render and would loop forever if each
 * call produced something new; reading localStorage on every render would also be
 * a synchronous disk-backed read in the render path.
 */
let snapshot: string | null = read()

function read(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    // Only a well-formed code is worth handing to a form. Anything else -
    // a leftover city name, a hand-edited value - reads as "not chosen yet".
    return raw && /^[A-Z]{2}$/.test(raw) ? raw : null
  } catch {
    // Private mode, or storage blocked. The picker still works for this page.
    return null
  }
}

function emit() {
  for (const listener of listeners) listener()
}

/** The chosen country code, or null when the buyer has never picked one. */
export function getDeliveryCountry(): string | null {
  return snapshot
}

/**
 * Records an explicit choice. Only ever called from a real interaction - the
 * header's picker or checkout's country field - never from prefilling a form,
 * which would let loaded data silently redefine what the buyer had chosen.
 */
export function setDeliveryCountry(code: string): void {
  const next = code.toUpperCase()
  if (next === snapshot) return
  snapshot = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // A rejected write just means the choice lasts for this page only.
  }
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another tab changing the choice writes storage but runs none of this tab's
  // code, so the event is the only way this tab hears about it.
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== STORAGE_KEY) return
    const next = read()
    if (next === snapshot) return
    snapshot = next
    emit()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Subscribes a component to the chosen delivery country. */
export function useDeliveryCountry(): string | null {
  return useSyncExternalStore(subscribe, getDeliveryCountry, getDeliveryCountry)
}

/** Test-only: drops the choice and the cached snapshot together. */
export function resetDeliveryCountryForTests(): void {
  snapshot = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored to begin with.
  }
  emit()
}
