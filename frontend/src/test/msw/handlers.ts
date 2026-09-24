import { http, HttpResponse } from 'msw'

import { consumeMagicLinkToken, issueMagicLinkToken } from './fixtures/sellerAuth'
import { productDetails, reviewsFor } from './fixtures/productDetails'
import { seedProducts } from './fixtures/products'
import { variantOffers } from './fixtures/variants'

export const handlers = [
  http.post('http://localhost:8080/auth/seller/magic-link', async ({ request }) => {
    const { email } = (await request.json()) as { email: string }
    issueMagicLinkToken(email)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('http://localhost:8080/auth/seller/verify', async ({ request }) => {
    const { token } = (await request.json()) as { token: string }
    const session = consumeMagicLinkToken(token)
    if (!session) {
      return HttpResponse.json(
        { type: 'https://api/errors/invalid-token', title: 'Invalid or expired token', status: 401 },
        { status: 401 },
      )
    }
    return HttpResponse.json(session)
  }),

  http.delete('http://localhost:8080/auth/seller/session', () => new HttpResponse(null, { status: 204 })),

  http.get('http://localhost:8080/variants', ({ request }) => {
    const url = new URL(request.url)
    const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
    const found = ids.map((id) => variantOffers[id]).filter((offer) => offer !== undefined)
    return HttpResponse.json(found)
  }),

  http.get('http://localhost:8080/products/:productId/reviews', ({ params, request }) => {
    const productId = params.productId as string
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 10)

    const all = reviewsFor(productId)
    const content = all.slice(page * size, page * size + size)

    return HttpResponse.json({
      content,
      page,
      totalElements: all.length,
      totalPages: Math.ceil(all.length / size) || 1,
    })
  }),

  http.get('http://localhost:8080/products/:productId', ({ params }) => {
    const detail = productDetails[params.productId as string]
    if (!detail) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      )
    }
    return HttpResponse.json(detail)
  }),

  http.get('http://localhost:8080/products', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const category = url.searchParams.get('category')?.toLowerCase()
    const priceMin = url.searchParams.get('priceMin')
    const priceMax = url.searchParams.get('priceMax')
    const inStockOnly = url.searchParams.get('inStockOnly') === 'true'
    const page = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 16)

    const filtered = seedProducts.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q)) return false
      if (category && p.category.toLowerCase() !== category) return false
      if (priceMin && p.priceFrom < Number(priceMin)) return false
      if (priceMax && p.priceFrom > Number(priceMax)) return false
      if (inStockOnly && !p.inStock) return false
      return true
    })

    const content = filtered.slice(page * size, page * size + size)

    return HttpResponse.json({
      content,
      page,
      totalElements: filtered.length,
      totalPages: Math.ceil(filtered.length / size) || 1,
    })
  }),
]
