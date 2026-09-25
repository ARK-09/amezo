import { http, HttpResponse } from 'msw'

import {
  clearSellerSession,
  consumeMagicLinkToken,
  currentSessionIdentity,
  issueMagicLinkToken,
} from './fixtures/sellerAuth'
import { findSellerOrder, listSellerOrders, summaryOf, updateSellerOrder } from './fixtures/sellerOrders'
import {
  addSellerProduct,
  addSellerVariant,
  confirmSellerImage,
  findSellerProductDetail,
  MAX_IMAGES_PER_PRODUCT,
  reserveSellerImage,
  removeSellerImage,
  removeSellerVariant,
  listSellerProducts,
  removeSellerProduct,
  TAKEN_SKU,
  updateSellerProductDetail,
  updateSellerVariant,
} from './fixtures/sellerProducts'
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

function notFound() {
  return HttpResponse.json(
    { type: 'https://api/errors/not-found', title: 'Not found', status: 404 },
    { status: 404 },
  )
}

export const handlers = [
  // Answers from the same mock "cookie" the verify and sign-out handlers below
  // maintain. No session is a 401, matching the backend's SessionController -
  // which the frontend reads as "nobody is signed in", not as an error.
  http.get('http://localhost:8080/sessions/current', () => {
    const identity = currentSessionIdentity()
    if (!identity) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
          detail: 'Session is missing, expired, or invalid',
        },
        { status: 401 },
      )
    }
    return HttpResponse.json(identity)
  }),

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

  http.get('http://localhost:8080/sellers/me/orders', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const content = listSellerOrders()
      .filter((order) => !status || order.status === status)
      .map(summaryOf)
    return HttpResponse.json({ content, page: 0, totalElements: content.length, totalPages: 1 })
  }),

  http.get('http://localhost:8080/sellers/me/orders/:orderId', ({ params }) => {
    const order = findSellerOrder(params.orderId as string)
    if (!order) {
      return HttpResponse.json({ type: 'about:blank', title: 'Not found', status: 404 }, { status: 404 })
    }
    return HttpResponse.json({ ...order, total: summaryOf(order).total })
  }),

  http.post('http://localhost:8080/sellers/me/orders/:orderId/ship', async ({ params, request }) => {
    const { trackingNumber } = (await request.json()) as { trackingNumber: string }
    const order = findSellerOrder(params.orderId as string)
    if (!order) {
      return HttpResponse.json({ type: 'about:blank', title: 'Not found', status: 404 }, { status: 404 })
    }
    if (order.status !== 'PLACED') {
      return HttpResponse.json(
        { type: 'https://api/errors/already-shipped', title: 'Already shipped', status: 409 },
        { status: 409 },
      )
    }
    const updated = updateSellerOrder(order.id, {
      status: 'SHIPPED',
      trackingNumber,
      shippedAt: new Date().toISOString(),
    })!
    return HttpResponse.json({ ...updated, total: summaryOf(updated).total })
  }),

  http.post('http://localhost:8080/products/:productId/variants', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    if (body.sku === TAKEN_SKU) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/sku-taken',
          title: 'SKU already in use',
          status: 409,
          detail: `SKU ${TAKEN_SKU} belongs to another variant`,
        },
        { status: 409 },
      )
    }
    const created = addSellerVariant(params.productId as string, {
      id: `variant-${String(body.sku)}`,
      label: String(body.label),
      sku: String(body.sku),
      price: Number(body.price),
      stockQty: Number(body.stockQty),
    })
    return created ? HttpResponse.json(created, { status: 201 }) : notFound()
  }),

  http.delete('http://localhost:8080/variants/:variantId', ({ params }) => {
    const outcome = removeSellerVariant(params.variantId as string)
    if (outcome === 'not-found') {
      return notFound()
    }
    if (outcome === 'last-variant') {
      return HttpResponse.json(
        {
          type: 'https://api/errors/last-variant',
          title: 'Last variant',
          status: 409,
          detail: 'A product needs at least one variant.',
        },
        { status: 409 },
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('http://localhost:8080/images/:imageId', ({ params }) => {
    return removeSellerImage(params.imageId as string)
      ? new HttpResponse(null, { status: 204 })
      : notFound()
  }),

  http.get('http://localhost:8080/sellers/me/products/:productId', ({ params }) => {
    const detail = findSellerProductDetail(params.productId as string)
    return detail ? HttpResponse.json(detail) : notFound()
  }),

  // Absent fields are left alone, same as the backend's PATCH semantics.
  http.patch('http://localhost:8080/products/:productId', async ({ params, request }) => {
    const patch = (await request.json()) as Record<string, unknown>
    const updated = updateSellerProductDetail(params.productId as string, patch)
    return updated ? HttpResponse.json(updated) : notFound()
  }),

  http.patch('http://localhost:8080/variants/:variantId', async ({ params, request }) => {
    const patch = (await request.json()) as Record<string, unknown>
    // The 409 the edit page has to surface inline - provoked by one reserved SKU.
    if (patch.sku === TAKEN_SKU) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/sku-taken',
          title: 'SKU already in use',
          status: 409,
          detail: `SKU ${TAKEN_SKU} belongs to another variant`,
        },
        { status: 409 },
      )
    }
    const updated = updateSellerVariant(params.variantId as string, patch)
    return updated ? HttpResponse.json(updated) : notFound()
  }),

  http.get('http://localhost:8080/sellers/me/products', () => {
    const content = listSellerProducts()
    return HttpResponse.json({ content, page: 0, totalElements: content.length, totalPages: 1 })
  }),

  http.post('http://localhost:8080/sellers/me/products', async ({ request }) => {
    const body = (await request.json()) as {
      title: string
      category: string
      variants: unknown[]
    }
    const id = crypto.randomUUID()
    addSellerProduct({
      id,
      title: body.title,
      thumbnailUrl: null,
      category: body.category,
      variantCount: body.variants.length,
      createdAt: new Date().toISOString(),
    })
    return HttpResponse.json({ id }, { status: 201 })
  }),

  http.delete('http://localhost:8080/products/:productId', ({ params }) => {
    removeSellerProduct(params.productId as string)
    return new HttpResponse(null, { status: 204 })
  }),

  // Reserves a row against the product's image cap, as the backend's presign does,
  // so uploading a batch fills the gallery here too instead of leaving the detail
  // query to answer with whatever it started with.
  http.post('http://localhost:8080/products/:productId/images/upload-url', async ({ params, request }) => {
    const { position } = (await request.json()) as { position: number }
    const reserved = reserveSellerImage(String(params.productId), position)
    if (reserved === 'not-found') return notFound()
    if (reserved === 'too-many-images') {
      return HttpResponse.json(
        {
          type: 'https://api/errors/too-many-images',
          title: 'Too many images',
          status: 409,
          detail: `A product can hold at most ${MAX_IMAGES_PER_PRODUCT} images. Remove one before adding another.`,
        },
        { status: 409 },
      )
    }
    return HttpResponse.json(
      {
        id: reserved.id,
        status: 'PENDING',
        uploadUrl: `https://mock-s3.local/upload/${reserved.id}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      { status: 201 },
    )
  }),

  http.put('https://mock-s3.local/upload/:imageId', () => new HttpResponse(null, { status: 200 })),

  http.post('http://localhost:8080/products/:productId/images/confirm', async ({ request }) => {
    const { imageId } = (await request.json()) as { imageId: string }
    if (!confirmSellerImage(imageId)) return notFound()
    return HttpResponse.json({ id: imageId, url: `https://mock-s3.local/stored/${imageId}`, position: 0 })
  }),
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

  http.delete('http://localhost:8080/auth/seller/session', () => {
    // Revokes the mock "cookie" too, so a GET /sessions/current after sign-out
    // answers 401 the way the backend's deleted session row makes it.
    clearSellerSession()
    return new HttpResponse(null, { status: 204 })
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
