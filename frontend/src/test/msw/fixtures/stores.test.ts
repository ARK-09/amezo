import { beforeEach, describe, expect, it } from 'vitest'

import type { components } from '@/lib/api/schema'

import { clearSellerSession, signInBuyerSession } from './sellerAuth'
import { resetFollowedStores } from './stores'

/**
 * The storefront's contract, exercised over HTTP the way the page's hooks call
 * it rather than through the mappers. Everything the old storefront did in the
 * browser - matching brandName, counting the loaded page, sorting a partial
 * list - is a server answer now, so these assert that the server actually gives
 * that answer instead of a shape the page can paper over.
 */

type ProblemDetail = components['schemas']['ProblemDetail']
type ProductSummaryPage = components['schemas']['ProductSummaryPage']
type PublicStore = components['schemas']['PublicStore']

const STORES = 'http://localhost:8080/api/v1/stores'

async function getStore(handle: string): Promise<PublicStore> {
  const response = await fetch(`${STORES}/${handle}`)
  expect(response.status).toBe(200)
  return (await response.json()) as PublicStore
}

async function getProducts(handle: string, query = ''): Promise<ProductSummaryPage> {
  const response = await fetch(`${STORES}/${handle}/products${query}`)
  expect(response.status).toBe(200)
  return (await response.json()) as ProductSummaryPage
}

function titles(page: ProductSummaryPage): string[] {
  return page.content.map((product) => product.title)
}

function follow(handle: string, method: 'PUT' | 'DELETE') {
  return fetch(`${STORES}/${handle}/follow`, { method })
}

function message(handle: string, body: Record<string, unknown>) {
  return fetch(`${STORES}/${handle}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  resetFollowedStores()
  clearSellerSession()
})

describe('public store detail', () => {
  it('serves the header fields the storefront reads', async () => {
    const store = await getStore('aurora-audio')

    expect(store.id).toBe('99999999-9999-9999-9999-999999999999')
    expect(store.name).toBe('Aurora Audio')
    expect(store.status).toBe('OPEN')
    expect(store.joinedAt).toBe('2021-03-08T00:00:00Z')
    expect(store.positiveRatingPct).toBe(98)
    expect(store.medianResponseMinutes).toBe(45)
    expect(store.policies?.shipsFrom).toBe('Portland, OR')
  })

  it('is the seller profile seen from outside, not a second copy of it', async () => {
    const store = await getStore('aurora-audio')

    // Both sides read one row, so the tagline cannot drift between them.
    const profile = await (await fetch('http://localhost:8080/api/v1/sellers/me/store')).json()
    expect(store.tagline).toBe(profile.tagline)
    expect(store.about).toBe(profile.about)
    expect(store.name).toBe(profile.name)
  })

  it('moves with the handle when the seller renames the store', async () => {
    await fetch('http://localhost:8080/api/v1/sellers/me/store', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: 'aurora-sound' }),
    })

    const renamed = await getStore('aurora-sound')
    expect(renamed.handle).toBe('aurora-sound')
    // The catalogue is matched by store id, so the listings come with it.
    expect(renamed.productCount).toBe(1)
    expect((await getProducts('aurora-sound')).content[0].store?.handle).toBe('aurora-sound')

    expect((await fetch(`${STORES}/aurora-audio`)).status).toBe(404)
  })

  it('counts the catalogue rather than quoting a seeded number', async () => {
    const vexel = await getStore('vexel')

    expect(vexel.productCount).toBe(2)
    expect(vexel.inStockCount).toBe(2)
    expect(vexel.ratingCount).toBe(66)
    // 4.8 over 42 reviews and 4.6 over 24, weighted.
    expect(vexel.averageRating).toBe(4.7)
    expect(vexel.productCount).toBe((await getProducts('vexel')).totalElements)
  })

  it('lists only the categories this store actually sells', async () => {
    expect((await getStore('hearth-and-home')).categories).toEqual([
      { slug: 'kitchen', name: 'Kitchen' },
      { slug: 'outdoor', name: 'Outdoor' },
    ])
    expect((await getStore('vexel')).categories).toEqual([
      { slug: 'electronics', name: 'Electronics' },
    ])
  })

  it('says nothing rather than zero when a store has no ratings', async () => {
    const store = await getStore('hearth-and-home')

    expect(store.ratingCount).toBe(0)
    expect(store.averageRating).toBeNull()
    // A share of no ratings is unknown, not 0%.
    expect(store.positiveRatingPct).toBeNull()
  })

  it('carries a store that has filled nothing in', async () => {
    const store = await getStore('northpeak')

    expect(store.tagline).toBeNull()
    expect(store.joinedAt).toBeNull()
    expect(store.medianResponseMinutes).toBeNull()
    // Its only listing is out of stock.
    expect(store.inStockCount).toBe(0)
  })

  it('looks a handle up case-insensitively', async () => {
    expect((await getStore('VEXEL')).handle).toBe('vexel')
  })

  it('answers a problem detail for a handle nobody holds', async () => {
    const response = await fetch(`${STORES}/not-a-store`)
    expect(response.status).toBe(404)

    const problem = (await response.json()) as ProblemDetail
    expect(problem.status).toBe(404)
    expect(problem.title).toBe('Not found')
  })
})

describe('store listings', () => {
  it('serves this store and no other', async () => {
    const page = await getProducts('vexel')

    expect(titles(page)).toEqual([
      '14" Ultrabook Laptop, 16GB RAM',
      'Mechanical Keyboard, Hot-Swappable',
    ])
    expect(page.totalElements).toBe(2)
    expect(page.content.every((product) => product.store?.handle === 'vexel')).toBe(true)
  })

  it('keeps brandName alongside the store, because cards still print it', async () => {
    const [product] = (await getProducts('aurora-audio')).content

    expect(product.brandName).toBe('Aurora Audio')
    expect(product.store).toEqual({
      id: '99999999-9999-9999-9999-999999999999',
      name: 'Aurora Audio',
      handle: 'aurora-audio',
    })
  })

  it('searches title, brand and category', async () => {
    expect(titles(await getProducts('vexel', '?q=ultrabook'))).toEqual([
      '14" Ultrabook Laptop, 16GB RAM',
    ])
    // The brand, which is not in either title.
    expect(await getProducts('vexel', '?q=vexel')).toMatchObject({ totalElements: 2 })
    // The category name, which is not in the title either.
    expect(titles(await getProducts('hearth-and-home', '?q=kitchen'))).toEqual([
      'Ceramic Non-Stick Cookware Set (10-piece)',
    ])
  })

  it('does not let a search reach another store', async () => {
    const page = await getProducts('aurora-audio', '?q=ultrabook')

    // Searching this store for another store's product finds nothing at all,
    // rather than finding it because the catalogue contains it.
    expect(page.content).toEqual([])
    expect(page.totalElements).toBe(0)
    expect(page.totalPages).toBe(1)
  })

  it('filters by category slug', async () => {
    const page = await getProducts('hearth-and-home', '?category=outdoor')

    expect(titles(page)).toEqual(['Stainless Steel Water Bottle, 32oz'])
    expect(page.totalElements).toBe(1)
  })

  it('sorts by price in both directions', async () => {
    expect(titles(await getProducts('vexel', '?sort=priceAsc'))).toEqual([
      'Mechanical Keyboard, Hot-Swappable',
      '14" Ultrabook Laptop, 16GB RAM',
    ])
    expect(titles(await getProducts('vexel', '?sort=priceDesc'))).toEqual([
      '14" Ultrabook Laptop, 16GB RAM',
      'Mechanical Keyboard, Hot-Swappable',
    ])
  })

  it('sorts by rating, and keeps unrated listings on the page', async () => {
    expect(titles(await getProducts('vexel', '?sort=rating'))).toEqual([
      '14" Ultrabook Laptop, 16GB RAM',
      'Mechanical Keyboard, Hot-Swappable',
    ])
    // Unrated is not zero-rated: they sort last, and they are still listed.
    expect(await getProducts('hearth-and-home', '?sort=rating')).toMatchObject({
      totalElements: 2,
    })
  })

  it('pages the results', async () => {
    const first = await getProducts('vexel', '?size=1&page=0')
    expect(titles(first)).toEqual(['14" Ultrabook Laptop, 16GB RAM'])
    expect(first).toMatchObject({ page: 0, totalElements: 2, totalPages: 2 })

    const second = await getProducts('vexel', '?size=1&page=1')
    expect(titles(second)).toEqual(['Mechanical Keyboard, Hot-Swappable'])
    expect(second.page).toBe(1)
  })

  it('counts what matched, not what the store sells', async () => {
    const page = await getProducts('vexel', '?q=keyboard&size=1')

    // The whole point of the endpoint: the store has two listings, the filter
    // matched one, and the count is of the match.
    expect(page.totalElements).toBe(1)
    expect(page.totalPages).toBe(1)
  })

  it('answers 404 for a store that does not exist', async () => {
    expect((await fetch(`${STORES}/not-a-store/products`)).status).toBe(404)
  })
})

describe('following a store', () => {
  const BUYER = { buyerIdentityId: 'buyer-following-1', email: 'rhea@example.com' }

  it('cannot say whether a signed-out visitor follows anything', async () => {
    expect((await getStore('vexel')).following).toBeNull()
  })

  it('refuses a follow from a signed-out visitor', async () => {
    const response = await follow('vexel', 'PUT')

    expect(response.status).toBe(401)
    expect(((await response.json()) as ProblemDetail).title).toBe('Unauthorized')
  })

  it('reports false, not null, once somebody is signed in', async () => {
    signInBuyerSession(BUYER)

    expect((await getStore('vexel')).following).toBe(false)
  })

  it('shows a follow on the next read of the store', async () => {
    signInBuyerSession(BUYER)

    expect((await follow('vexel', 'PUT')).status).toBe(204)
    expect((await getStore('vexel')).following).toBe(true)
  })

  it('takes a second follow as the same answer', async () => {
    signInBuyerSession(BUYER)
    await follow('vexel', 'PUT')

    expect((await follow('vexel', 'PUT')).status).toBe(204)
    expect((await getStore('vexel')).following).toBe(true)
  })

  it('unfollows, and takes a second unfollow as the same answer', async () => {
    signInBuyerSession(BUYER)
    await follow('vexel', 'PUT')

    expect((await follow('vexel', 'DELETE')).status).toBe(204)
    expect((await getStore('vexel')).following).toBe(false)

    expect((await follow('vexel', 'DELETE')).status).toBe(204)
    expect((await getStore('vexel')).following).toBe(false)
  })

  it('follows one store without following the next', async () => {
    signInBuyerSession(BUYER)
    await follow('vexel', 'PUT')

    expect((await getStore('aurora-audio')).following).toBe(false)
  })

  it('does not hand one buyer the follows of another', async () => {
    signInBuyerSession(BUYER)
    await follow('vexel', 'PUT')

    signInBuyerSession({ buyerIdentityId: 'buyer-following-2', email: 'sam@example.com' })
    expect((await getStore('vexel')).following).toBe(false)
  })

  it('answers 404 for a store that does not exist', async () => {
    signInBuyerSession(BUYER)

    expect((await follow('not-a-store', 'PUT')).status).toBe(404)
  })
})

describe('messaging a store', () => {
  // The seller answers to the address on the caller's account, so the endpoint
  // refuses an anonymous caller before it even looks the store up - an endpoint
  // that emails sellers on behalf of nobody is a spam relay.
  const SENDER = { buyerIdentityId: 'buyer-messaging-1', email: 'rhea@example.com' }
  beforeEach(() => signInBuyerSession(SENDER))

  it('refuses a caller with no buyer session', async () => {
    clearSellerSession()
    const response = await message('vexel', { body: 'Do you ship to Oman, and how long does it take?' })

    expect(response.status).toBe(401)
  })

  it('accepts the message for delivery', async () => {
    const response = await message('vexel', {
      subject: 'Spare keycaps',
      body: 'Do you sell replacement keycaps for the hot-swappable board on its own?',
    })

    expect(response.status).toBe(202)
  })

  it('accepts a message with no subject', async () => {
    const response = await message('vexel', { body: 'Is the laptop battery user-replaceable?' })

    expect(response.status).toBe(202)
  })

  it('names the field when the message is too short', async () => {
    const response = await message('vexel', { body: 'too short' })

    expect(response.status).toBe(422)
    const problem = (await response.json()) as ProblemDetail
    expect(problem.errors).toEqual([{ field: 'body', reason: 'at least 10 characters' }])
  })

  it('does not count whitespace towards the minimum', async () => {
    const response = await message('vexel', { body: '              ' })

    expect(response.status).toBe(422)
    expect(((await response.json()) as ProblemDetail).errors?.[0].field).toBe('body')
  })

  it('names the field when the message is too long', async () => {
    const response = await message('vexel', { body: 'a'.repeat(2001) })

    expect(response.status).toBe(422)
    expect(((await response.json()) as ProblemDetail).errors?.[0].reason).toBe(
      'at most 2000 characters',
    )
  })

  it('reports every bad field at once, not just the first', async () => {
    const response = await message('vexel', { subject: 's'.repeat(121), body: 'short' })

    expect(response.status).toBe(422)
    const problem = (await response.json()) as ProblemDetail
    expect(problem.errors?.map((error) => error.field)).toEqual(['subject', 'body'])
  })

  it('answers 404 for a store that does not exist', async () => {
    const response = await message('not-a-store', {
      body: 'Do you ship to Canada, and how long does it usually take?',
    })

    expect(response.status).toBe(404)
  })
})
