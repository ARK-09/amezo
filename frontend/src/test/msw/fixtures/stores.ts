import type { components } from '@/lib/api/schema'

import { seedProducts, seedStoreRefs } from './products'
import { getStoreProfile } from './storeProfile'

type Category = components['schemas']['Category']
type ProductSummary = components['schemas']['ProductSummary']
type ProductSummaryPage = components['schemas']['ProductSummaryPage']
type PublicStore = components['schemas']['PublicStore']
type StorePolicies = components['schemas']['StorePolicies']
type StoreRef = components['schemas']['StoreRef']
type StoreStatus = components['schemas']['StoreStatus']

export type StoreSort = 'relevance' | 'priceAsc' | 'priceDesc' | 'rating'

/**
 * The public storefront for local development and tests.
 *
 * /api/v1/stores/{handle} and everything under it does not exist on the backend
 * yet; see docs/backend-handoff.md. Identity comes from the catalogue's
 * StoreRefs (fixtures/products.ts) and the numbers are counted off that same
 * catalogue, so a storefront cannot advertise a product the search page will not
 * show, or a count the listings endpoint disagrees with.
 *
 * The one store that also has a seller-side profile reads its editable fields
 * live from fixtures/storeProfile.ts rather than keeping a second copy: renaming
 * the store in Store settings renames it here, which is what a shared row does.
 */

/** What a seller edits about their own store, for the stores that have no profile. */
interface StoreFacade {
  tagline: string | null
  location: string | null
  about: string | null
  coverUrl: string | null
  logoUrl: string | null
  status: StoreStatus
  vacationNote: string | null
}

interface StorefrontSeed {
  /** Omitted for the store that has a real profile - see facadeFor. */
  facade?: StoreFacade
  /** When the seller joined Amezo, not when the business began. */
  joinedAt: string | null
  /**
   * Seller feedback, which the catalogue cannot produce: a product's avgRating
   * is about the product, not about how the seller trades. Seeded rather than
   * derived - but suppressed below when the store has no ratings at all, so it
   * can never claim a percentage of nothing.
   */
  positiveRatingPct: number | null
  medianResponseMinutes: number | null
  policies: StorePolicies
}

const NO_POLICIES: StorePolicies = {
  shipping: null,
  returns: null,
  warranty: null,
  shipsFrom: null,
}

const STOREFRONTS: Record<string, StorefrontSeed> = {
  // Aurora Audio: the demo seller's own store, so no facade here.
  '99999999-9999-9999-9999-999999999999': {
    joinedAt: '2021-03-08T00:00:00Z',
    positiveRatingPct: 98,
    medianResponseMinutes: 45,
    policies: {
      shipping: 'Ships within one business day from Portland. Free over $75.',
      returns: '30 days, opened or not. We pay return postage on faulty units.',
      warranty: 'Two years, plus paid repairs for as long as we can get parts.',
      shipsFrom: 'Portland, OR',
    },
  },
  'cccccccc-3333-3333-3333-cccccccccccc': {
    facade: {
      tagline: 'Computing hardware for people who open the case.',
      location: 'Austin, TX',
      about:
        'Vexel builds laptops and keyboards around parts you can replace yourself. Every model ships with a service manual and a parts list, and we keep spares for six years after a line ends.',
      coverUrl: null,
      logoUrl: null,
      status: 'OPEN',
      vacationNote: null,
    },
    joinedAt: '2018-11-02T00:00:00Z',
    positiveRatingPct: 94,
    medianResponseMinutes: 180,
    policies: {
      shipping: 'Two to four business days, tracked.',
      returns: '14 days, unopened.',
      warranty: null,
      shipsFrom: 'Austin, TX',
    },
  },
  // Away, so the storefront's vacation banner has something to render.
  'dddddddd-4444-4444-4444-dddddddddddd': {
    facade: {
      tagline: 'Cookware and everyday kit that outlives the receipt.',
      location: 'Asheville, NC',
      about: null,
      coverUrl: null,
      logoUrl: null,
      status: 'VACATION',
      vacationNote: 'Back on 10 October - orders placed now ship when we return.',
    },
    joinedAt: '2023-06-19T00:00:00Z',
    // Seeded, but answered as null below: this store has no ratings yet.
    positiveRatingPct: 91,
    medianResponseMinutes: null,
    policies: {
      shipping: 'Ships Mondays and Thursdays.',
      returns: null,
      warranty: null,
      shipsFrom: 'Asheville, NC',
    },
  },
  // Everything unknown: a store that has filled nothing in is not an error, and
  // the header has to read sensibly without a single optional field.
  'eeeeeeee-5555-5555-5555-eeeeeeeeeeee': {
    facade: {
      tagline: null,
      location: null,
      about: null,
      coverUrl: null,
      logoUrl: null,
      status: 'OPEN',
      vacationNote: null,
    },
    joinedAt: null,
    positiveRatingPct: null,
    medianResponseMinutes: null,
    policies: NO_POLICIES,
  },
}

/** Handles are case-insensitive on lookup - see StoreHandle in the contract. */
function sameHandle(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * The store's identity as it stands now. The catalogue's StoreRef is a snapshot
 * taken when the fixture was written; the seller's profile is the live row, so a
 * handle changed in Store settings moves the storefront's URL and every card
 * that links to it, instead of leaving the catalogue pointing at a dead handle.
 */
function liveRef(ref: StoreRef): StoreRef {
  const profile = getStoreProfile()
  if (ref.id !== profile.id) return ref
  return { id: profile.id, name: profile.name, handle: profile.handle }
}

function storeRefs(): StoreRef[] {
  return seedStoreRefs().map(liveRef)
}

export function findStoreByHandle(handle: string): StoreRef | undefined {
  return storeRefs().find((ref) => sameHandle(ref.handle, handle))
}

/** Matching is by store id, the stable key - not by the handle in the URL. */
function isListedBy(product: ProductSummary, storeId: string): boolean {
  return product.store?.id === storeId
}

/** Products as served: the catalogue row with its store ref brought up to date. */
export function storeListings(storeId: string): ProductSummary[] {
  return seedProducts
    .filter((product) => isListedBy(product, storeId))
    .map((product) => ({ ...product, store: product.store && liveRef(product.store) }))
}

/** Every catalogue row with a current store ref, for GET /products. */
export function listingsWithStore(products: ProductSummary[]): ProductSummary[] {
  return products.map((product) => ({
    ...product,
    store: product.store && liveRef(product.store),
  }))
}

function facadeFor(ref: StoreRef): StoreFacade {
  const seeded = STOREFRONTS[ref.id!]?.facade
  if (seeded) return seeded
  // The store the demo seller signs in to: one row, read from the profile.
  const profile = getStoreProfile()
  return {
    tagline: profile.tagline ?? null,
    location: profile.location ?? null,
    about: profile.about ?? null,
    coverUrl: profile.coverUrl ?? null,
    logoUrl: profile.logoUrl ?? null,
    status: profile.status ?? 'OPEN',
    vacationNote: profile.vacationNote ?? null,
  }
}

/**
 * Weighted by review count, not a mean of means: a product rated 4.8 by forty
 * people should not count the same as one rated 3.0 by one person.
 */
function averageRating(listings: ProductSummary[]): number | null {
  const rated = listings.filter((product) => product.avgRating != null && product.reviewCount > 0)
  const reviews = rated.reduce((sum, product) => sum + product.reviewCount, 0)
  if (reviews === 0) return null
  const weighted = rated.reduce(
    (sum, product) => sum + (product.avgRating ?? 0) * product.reviewCount,
    0,
  )
  return Math.round((weighted / reviews) * 10) / 10
}

/**
 * The categories this store actually lists in, by name. Derived rather than
 * seeded so the chips cannot offer a category the store has stopped selling -
 * and not taken from the system list, which offers categories it never sold.
 */
function categoriesOf(listings: ProductSummary[]): Category[] {
  const bySlug = new Map(listings.map((product) => [product.category.slug, product.category]))
  return Array.from(bySlug.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export function publicStoreOf(ref: StoreRef, following: boolean | null): PublicStore {
  const seed = STOREFRONTS[ref.id!]
  const facade = facadeFor(ref)
  const listings = storeListings(ref.id!)
  const ratingCount = listings.reduce((sum, product) => sum + product.reviewCount, 0)

  return {
    id: ref.id!,
    name: ref.name,
    handle: ref.handle,
    ...facade,
    productCount: listings.length,
    inStockCount: listings.filter((product) => product.inStock).length,
    averageRating: averageRating(listings),
    ratingCount,
    categories: categoriesOf(listings),
    policies: seed?.policies ?? NO_POLICIES,
    joinedAt: seed?.joinedAt ?? null,
    // A share of no ratings is not 0%, it is unknown.
    positiveRatingPct: ratingCount > 0 ? seed?.positiveRatingPct ?? null : null,
    medianResponseMinutes: seed?.medianResponseMinutes ?? null,
    following,
  }
}

// --- listings ---------------------------------------------------------------

/** q matches what a shopper can see on the card: title, brand and category. */
function matchesQuery(product: ProductSummary, q: string): boolean {
  return [product.title, product.brandName, product.category.name, product.category.slug].some(
    (field) => field.toLowerCase().includes(q),
  )
}

/**
 * Nulls last on rating. An unrated product is not a zero-rated one, so it sorts
 * behind everything that has a rating rather than below the worst of them.
 */
function compareRating(a: ProductSummary, b: ProductSummary): number {
  if (a.avgRating == null && b.avgRating == null) return 0
  if (a.avgRating == null) return 1
  if (b.avgRating == null) return -1
  return b.avgRating - a.avgRating
}

function sortListings(listings: ProductSummary[], sort: StoreSort): ProductSummary[] {
  // relevance is the catalogue's own order, which is what the store curated.
  if (sort === 'relevance') return listings
  const sorted = [...listings]
  if (sort === 'priceAsc') sorted.sort((a, b) => a.priceFrom - b.priceFrom)
  if (sort === 'priceDesc') sorted.sort((a, b) => b.priceFrom - a.priceFrom)
  if (sort === 'rating') sorted.sort(compareRating)
  return sorted
}

export interface StoreProductQuery {
  q?: string | null
  category?: string | null
  sort?: string | null
  page?: string | number | null
  size?: string | number | null
}

const DEFAULT_SIZE = 24
const SORTS: StoreSort[] = ['relevance', 'priceAsc', 'priceDesc', 'rating']

function asSort(value: string | null | undefined): StoreSort {
  return SORTS.includes(value as StoreSort) ? (value as StoreSort) : 'relevance'
}

function asInt(
  value: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  // An absent param is the default, not zero - Number(null) is 0, which silently
  // clamped every page to one row when the caller left size off.
  if (value == null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

/**
 * The store's listings, filtered and paged the way a server does it: narrow to
 * the store first, then q and category, then sort, then cut the page. Doing it
 * in that order is what makes totalElements the count of what matched rather
 * than the size of the store's catalogue - the figure the old client-side
 * storefront could not produce, because it only ever saw one page.
 */
export function storeProductsPage(storeId: string, query: StoreProductQuery): ProductSummaryPage {
  const q = query.q?.trim().toLowerCase()
  const category = query.category?.trim().toLowerCase()
  const page = asInt(query.page, 0, 0, Number.MAX_SAFE_INTEGER)
  const size = asInt(query.size, DEFAULT_SIZE, 1, 100)

  const matched = storeListings(storeId).filter((product) => {
    if (q && !matchesQuery(product, q)) return false
    // The slug, which is what a ?category= filter carries.
    if (category && product.category.slug !== category) return false
    return true
  })

  const sorted = sortListings(matched, asSort(query.sort))

  return {
    content: sorted.slice(page * size, page * size + size),
    page,
    totalElements: matched.length,
    totalPages: Math.ceil(matched.length / size) || 1,
  }
}

// --- follows ----------------------------------------------------------------

/**
 * Who follows what. Keyed by the follower, because that is what the real table
 * is: signing out and back in as somebody else must not inherit the first
 * buyer's follows, and a signed-out visitor has no row at all - which is why
 * PublicStore.following is null for them rather than false.
 */
const followsByIdentity = new Map<string, Set<string>>()

export function resetFollowedStores() {
  followsByIdentity.clear()
}

export function isFollowing(identityId: string, storeId: string): boolean {
  return followsByIdentity.get(identityId)?.has(storeId) ?? false
}

/** Idempotent: a second follow is the same answer, not a conflict. */
export function followStore(identityId: string, storeId: string) {
  const followed = followsByIdentity.get(identityId) ?? new Set<string>()
  followed.add(storeId)
  followsByIdentity.set(identityId, followed)
}

/** Idempotent in the same way - unfollowing what was never followed is fine. */
export function unfollowStore(identityId: string, storeId: string) {
  followsByIdentity.get(identityId)?.delete(storeId)
}
