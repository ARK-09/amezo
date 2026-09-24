import { http, HttpResponse } from 'msw'

import { productDetails, reviewsFor } from './fixtures/productDetails'
import { seedProducts } from './fixtures/products'
import { variantOffers } from './fixtures/variants'

interface CheckoutLineBody {
  variantId: string
  quantity: number
  expectedUnitPrice?: number | null
}

interface CheckoutRequestBody {
  lines: CheckoutLineBody[]
}

export const handlers = [
  // No magic-link auth is built (frontend or backend) - 401 is the only
  // realistic default, matching "guest, no session" as the normal case.
  http.get('http://localhost:8080/sessions/current', () =>
    HttpResponse.json({ type: 'about:blank', title: 'Unauthorized', status: 401 }, { status: 401 }),
  ),

  // Happy path, stock failure, and price drift all fall out of comparing
  // the submitted lines against the SAME variantOffers fixture /variants
  // already serves - not three hand-coded scenarios that can drift apart
  // from each other. Trail Running Shoes (already stockQty: 0 in the
  // fixture) reliably triggers out-of-stock without any special-casing;
  // any line whose expectedUnitPrice disagrees with the fixture price
  // triggers price-changed.
  http.post('http://localhost:8080/orders', async ({ request }) => {
    const body = (await request.json()) as CheckoutRequestBody

    const stockErrors: { field: string; reason: string }[] = []
    const priceErrors: { field: string; reason: string }[] = []

    body.lines.forEach((line, i) => {
      const offer = variantOffers[line.variantId]
      if (!offer) {
        stockErrors.push({ field: `lines[${i}].variantId`, reason: 'no longer available' })
        return
      }
      if (offer.stockQty < line.quantity) {
        stockErrors.push({
          field: `lines[${i}].variantId`,
          reason: `requested ${line.quantity}, available ${offer.stockQty}`,
        })
      }
      if (line.expectedUnitPrice != null && line.expectedUnitPrice !== offer.price) {
        priceErrors.push({
          field: `lines[${i}].variantId`,
          reason: `expected ${line.expectedUnitPrice.toFixed(2)}, now ${offer.price.toFixed(2)}`,
        })
      }
    })

    if (stockErrors.length > 0) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/out-of-stock',
          title: 'Out of stock',
          status: 409,
          detail: 'One or more lines are no longer available in the requested quantity',
          errors: stockErrors,
        },
        { status: 409 },
      )
    }

    if (priceErrors.length > 0) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/price-changed',
          title: 'Price changed',
          status: 409,
          detail: 'One or more lines have a different price than expected',
          errors: priceErrors,
        },
        { status: 409 },
      )
    }

    const lines = body.lines.map((line, i) => {
      const offer = variantOffers[line.variantId]
      return {
        id: `order-line-${i}`,
        productTitle: offer.productTitle,
        variantLabel: offer.variantLabel,
        quantity: line.quantity,
        unitPrice: offer.price,
        lineTotal: offer.price * line.quantity,
      }
    })
    const total = lines.reduce((sum, l) => sum + l.lineTotal, 0)

    return HttpResponse.json(
      { id: crypto.randomUUID(), placedAt: new Date().toISOString(), lines, total },
      { status: 201 },
    )
  }),

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
