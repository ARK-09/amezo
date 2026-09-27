import type { components } from '@/lib/api/schema'

export type StoreRef = components['schemas']['StoreRef']

/**
 * What to call the shop that lists a product, and where to send a reader who clicks it.
 *
 * One module because two places on the product page name the same shop - the breadcrumb
 * crumb and "Sold by" - and they must not disagree about either half.
 */

/**
 * The shop's name, which is the STORE's name and not the product's brand.
 *
 * They are different facts. `brandName` is free text the seller types per listing: a
 * shop selling someone else's goods puts the manufacturer there, so "Sold by Sony" on
 * a charger listed by Bob's Electronics was simply wrong. The store name is the shop.
 *
 * brandName is the fallback, not the source: a product whose seller row is gone has no
 * store, and the brand is the only name left to print.
 */
export function storeLabel(
  store: StoreRef | null | undefined,
  brandName: string | null | undefined,
): string | null {
  return store?.name ?? brandName ?? null
}

/**
 * Where the storefront is, or null when it cannot be linked to at all.
 *
 * Three cases, and the middle one is why this returns null rather than a string:
 *
 * - a handle: the storefront's own URL, which is the only thing that addresses it;
 * - a store with NO handle: a seller whose store row has not been provisioned yet
 *   (V18 backfills nothing, and identity refuses to mint a handle on a read). There is
 *   no URL to give, and `/stores/null` is worse than plain text;
 * - no store at all: fall back to the display name, which the store route still
 *   resolves for pre-handle links.
 *
 * What it never does is slugify the name into a guess. The handle is the server's to
 * mint, and a guessed one would not match the one provisioning later assigns.
 */
export function storePath(
  store: StoreRef | null | undefined,
  brandName: string | null | undefined,
): string | null {
  if (store?.handle) return `/stores/${store.handle}`
  if (store) return null
  return brandName ? `/stores/${encodeURIComponent(brandName)}` : null
}
