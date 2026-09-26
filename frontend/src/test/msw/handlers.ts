import { http, HttpResponse } from 'msw'

import {
  clearSellerSession,
  consumeMagicLinkToken,
  currentSessionIdentity,
  issueMagicLinkToken,
  signInBuyerSession,
} from './fixtures/sellerAuth'
import {
  buyerOrderDetailOf,
  findBuyerOrder,
  inBuyerGroup,
  listBuyerOrders,
} from './fixtures/buyerOrders'
import { systemCategories } from './fixtures/categories'
import { currentLastCheckoutDetails } from './fixtures/checkoutDetails'
import { mockCountries } from './fixtures/countries'
import { productIdForPurchasedLine, purchasedLineFor } from './fixtures/purchases'
import { categoryBreakdown, metricsFor, topProducts } from './fixtures/sellerMetrics'
import {
  TAKEN_HANDLES,
  confirmStoreImage,
  getStoreProfile,
  patchStoreProfile,
  reserveStoreImage,
} from './fixtures/storeProfile'
import {
  findStoreByHandle,
  followStore,
  isFollowing,
  listingsWithStore,
  publicStoreOf,
  storeProductsPage,
  unfollowStore,
} from './fixtures/stores'
import {
  addRefundRequest,
  canTransition,
  findRefundRequest,
  listRefundRequests,
  summaryOfRefund,
  updateRefundRequest,
} from './fixtures/refunds'
import {
  findSellerOrder,
  listSellerOrderRows,
  inOrderGroup,
  ORDER_GROUPS,
  listSellerOrders,
  sellerOrderRowDetailOf,
  summaryOf,
  updateSellerOrder,
} from './fixtures/sellerOrders'
import {
  addSellerProduct,
  addSellerVariant,
  confirmSellerImage,
  reorderSellerImages,
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
  listSellerProductRows,} from './fixtures/sellerProducts'
import {
  addWrittenReview,
  updateWrittenReview,
  productDetails,
  reviewsFor,
  writtenReviewsFor,
} from './fixtures/productDetails'
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

/** The backend's slug rule, close enough for a mock: see Slugs.slugify. */
function mockSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function notFound() {
  return HttpResponse.json(
    { type: 'https://api/errors/not-found', title: 'Not found', status: 404 },
    { status: 404 },
  )
}

function unauthorized() {
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

/** The signed-in buyer, or null - the same mock cookie the other routes read. */
function currentBuyer() {
  const identity = currentSessionIdentity()
  return identity?.identityType === 'BUYER' ? identity : null
}

/** What a bucket of orders is worth, for the tabs that print it. */
function sum(rows: { total: number }[]): number {
  return rows.reduce((running, row) => running + row.total, 0)
}

export const handlers = [

  // --- /api/v1 --------------------------------------------------------------
  // These endpoints do not exist on the backend yet; see docs/backend-handoff.md.
  // They run only under VITE_USE_MSW and in vitest.

  http.get('http://localhost:8080/api/v1/sellers/me/metrics', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json(
      metricsFor(url.searchParams.get('from')!, url.searchParams.get('to')!),
    )
  }),

  http.get('http://localhost:8080/api/v1/sellers/me/metrics/top-products', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json(topProducts(Number(url.searchParams.get('limit') ?? 5)))
  }),

  http.get('http://localhost:8080/api/v1/sellers/me/metrics/category-breakdown', () =>
    HttpResponse.json(categoryBreakdown()),
  ),

  http.get('http://localhost:8080/api/v1/sellers/me/store', () =>
    HttpResponse.json(getStoreProfile()),
  ),

  http.patch('http://localhost:8080/api/v1/sellers/me/store', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const handle = body.handle as string | undefined

    if (handle && TAKEN_HANDLES.includes(handle)) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/handle-taken',
          title: 'Handle taken',
          status: 409,
          detail: `${handle} is already in use`,
          errors: [{ field: 'handle', reason: 'already taken' }],
        },
        { status: 409 },
      )
    }
    if (handle && !/^[a-z0-9][a-z0-9-]{1,38}$/.test(handle)) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/validation',
          title: 'Validation failed',
          status: 422,
          errors: [{ field: 'handle', reason: 'lowercase letters, numbers and dashes only' }],
        },
        { status: 422 },
      )
    }

    return HttpResponse.json(patchStoreProfile(body))
  }),

  /**
   * The public storefront header. Everything countable on it is counted off the
   * same catalogue the listings endpoint below serves, so the stats strip cannot
   * disagree with the grid under it.
   */
  http.get('http://localhost:8080/api/v1/stores/:handle', ({ params }) => {
    const store = findStoreByHandle(String(params.handle))
    if (!store) return notFound()

    // null, not false: a signed-out visitor is not following this store and
    // cannot be asked to, which is a different answer from "following: no".
    const buyer = currentBuyer()
    const following = buyer ? isFollowing(buyer.identityId, store.id!) : null

    return HttpResponse.json(publicStoreOf(store, following))
  }),

  http.get('http://localhost:8080/api/v1/stores/:handle/products', ({ params, request }) => {
    const store = findStoreByHandle(String(params.handle))
    if (!store) return notFound()

    const url = new URL(request.url)
    return HttpResponse.json(
      storeProductsPage(store.id!, {
        q: url.searchParams.get('q'),
        category: url.searchParams.get('category'),
        sort: url.searchParams.get('sort'),
        page: url.searchParams.get('page'),
        size: url.searchParams.get('size'),
      }),
    )
  }),

  /**
   * Follow, and unfollow, are the same route in two verbs and both are
   * idempotent - the button is optimistic, so a double click has to land on the
   * state it shows rather than on a 409. Buyer-scoped like the other
   * buyer-only routes: with no buyer session the mock answers 401, because a
   * follow belongs to somebody.
   */
  http.put('http://localhost:8080/api/v1/stores/:handle/follow', ({ params }) => {
    const buyer = currentBuyer()
    if (!buyer) return unauthorized()
    const store = findStoreByHandle(String(params.handle))
    if (!store) return notFound()

    followStore(buyer.identityId, store.id!)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('http://localhost:8080/api/v1/stores/:handle/follow', ({ params }) => {
    const buyer = currentBuyer()
    if (!buyer) return unauthorized()
    const store = findStoreByHandle(String(params.handle))
    if (!store) return notFound()

    unfollowStore(buyer.identityId, store.id!)
    return new HttpResponse(null, { status: 204 })
  }),

  /**
   * A question for the seller. Accepted for delivery, not answered: nothing
   * reads it back, so nothing is stored. The bounds are the contract's, checked
   * here because a mock that accepts anything is how a form ships without the
   * error states the real endpoint will show it.
   */
  http.post('http://localhost:8080/api/v1/sellers/me/store/images', async ({ request }) => {
    const seller = currentSessionIdentity()
    if (!seller || seller.identityType !== 'SELLER') return unauthorized()
    const { slot, contentType } = (await request.json()) as { slot: 'COVER' | 'LOGO'; contentType: string }
    if (!contentType?.startsWith('image/')) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/validation',
          title: 'Validation failed',
          status: 422,
          errors: [{ field: 'contentType', reason: 'must be an image' }],
        },
        { status: 422 },
      )
    }
    const reserved = reserveStoreImage(slot)
    return HttpResponse.json(
      { ...reserved, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() },
      { status: 201 },
    )
  }),

  http.post('http://localhost:8080/api/v1/sellers/me/store/images/confirm', async ({ request }) => {
    const seller = currentSessionIdentity()
    if (!seller || seller.identityType !== 'SELLER') return unauthorized()
    const { id, slot } = (await request.json()) as { id: string; slot: 'COVER' | 'LOGO' }
    const result = confirmStoreImage(id, slot)
    if (result === 'not-found') return notFound()
    if (result === 'slot-mismatch') {
      return HttpResponse.json(
        {
          type: 'https://api/errors/validation',
          title: 'Validation failed',
          status: 422,
          errors: [{ field: 'slot', reason: 'does not match the reserved slot' }],
        },
        { status: 422 },
      )
    }
    return HttpResponse.json(result)
  }),

  http.post('http://localhost:8080/api/v1/stores/:handle/messages', async ({ params, request }) => {
    // Checked before the handle lookup, the way a security filter runs ahead of
    // the controller. The seller answers to the address on the caller's account,
    // so there has to be one.
    if (!currentBuyer()) return unauthorized()

    const store = findStoreByHandle(String(params.handle))
    if (!store) return notFound()

    const body = (await request.json()) as { subject?: string; body?: string }
    const errors: { field: string; reason: string }[] = []

    const subject = body.subject ?? ''
    if (subject.length > 120) errors.push({ field: 'subject', reason: 'at most 120 characters' })

    const message = body.body ?? ''
    // Trimmed for the lower bound: ten spaces is not ten characters of question.
    if (message.trim().length < 10) errors.push({ field: 'body', reason: 'at least 10 characters' })
    else if (message.length > 2000) errors.push({ field: 'body', reason: 'at most 2000 characters' })

    if (errors.length > 0) {
      return HttpResponse.json(
        { type: 'https://api/errors/validation', title: 'Validation failed', status: 422, errors },
        { status: 422 },
      )
    }

    return new HttpResponse(null, { status: 202 })
  }),

  http.get('http://localhost:8080/api/v1/sellers/me/orders/facets', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    // Honours q, ignores group and status on purpose: the tabs show every
    // bucket at once, so narrowing by the tab being viewed would zero the rest.
    const rows = listSellerOrderRows().filter(
      (row) =>
        !q || `${row.reference} ${row.recipientName} ${row.buyerEmail}`.toLowerCase().includes(q),
    )
    const bucket = (keys: readonly string[]) => rows.filter((row) => keys.includes(row.status))
    return HttpResponse.json({
      facets: [
        { key: 'all', count: rows.length, value: sum(rows), currency: 'USD' },
        ...Object.entries(ORDER_GROUPS).map(([key, statuses]) => {
          const inBucket = bucket(statuses)
          return { key, count: inBucket.length, value: sum(inBucket), currency: 'USD' }
        }),
      ],
    })
  }),

  http.get('http://localhost:8080/api/v1/sellers/me/refund-requests/facets', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const rows = listRefundRequests().filter(
      (row) => !q || `${row.reference} ${row.buyerName ?? ''}`.toLowerCase().includes(q),
    )
    // Every RefundStatus, which is what the list's own status filter takes. A
    // short list here would leave a real bucket with no count while the tab for
    // it still rendered.
    const statuses: string[] = [
      'REQUESTED',
      'APPROVED',
      'AWAITING_RETURN',
      'RETURN_RECEIVED',
      'REFUNDED',
      'REPLACEMENT_SENT',
      'DECLINED',
      'CANCELLED',
    ]
    return HttpResponse.json({
      facets: [
        { key: 'all', count: rows.length, value: null, currency: null },
        ...statuses.map((key) => ({
          key,
          count: rows.filter((row) => row.status === key).length,
          value: null,
          currency: null,
        })),
      ],
    })
  }),

  http.get('http://localhost:8080/api/v1/orders/facets', ({ request }) => {
    const buyer = currentBuyer()
    if (!buyer) return unauthorized()
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const rows = listBuyerOrders().filter(
      (row) => !q || `${row.reference} ${row.seller.name}`.toLowerCase().includes(q),
    )
    // Keyed by the same group values GET /api/v1/orders takes.
    const counted = (group: string) => rows.filter((row) => inBuyerGroup(row, group)).length
    return HttpResponse.json({
      facets: ['all', 'in_progress', 'delivered', 'refunds'].map((key) => ({
        key,
        count: counted(key),
        value: null,
        currency: null,
      })),
    })
  }),

  http.get('http://localhost:8080/api/v1/sellers/me/orders', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const status = url.searchParams.get('status')
    const sort = url.searchParams.get('sort') ?? 'newest'
    const page = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 20)

    const group = url.searchParams.get('group')
    let rows = listSellerOrderRows().filter((row) => {
      if (status && row.status !== status) return false
      if (group && !inOrderGroup(row.status, group)) return false
      if (q && !`${row.reference} ${row.recipientName} ${row.buyerEmail}`.toLowerCase().includes(q)) {
        return false
      }
      return true
    })

    const by: Record<string, (a: typeof rows[number], b: typeof rows[number]) => number> = {
      newest: (a, b) => b.placedAt.localeCompare(a.placedAt),
      oldest: (a, b) => a.placedAt.localeCompare(b.placedAt),
      total_desc: (a, b) => b.total - a.total,
      total_asc: (a, b) => a.total - b.total,
    }
    rows = [...rows].sort(by[sort] ?? by.newest)

    return HttpResponse.json({
      content: rows.slice(page * size, page * size + size),
      page,
      totalElements: rows.length,
      totalPages: Math.ceil(rows.length / size) || 1,
    })
  }),

  http.get('http://localhost:8080/api/v1/sellers/me/orders/:orderId', ({ params }) => {
    const order = findSellerOrder(params.orderId as string)
    if (!order) {
      return HttpResponse.json({ type: 'about:blank', title: 'Not found', status: 404 }, { status: 404 })
    }
    return HttpResponse.json(sellerOrderRowDetailOf(order))
  }),

  http.patch('http://localhost:8080/api/v1/sellers/me/orders/:orderId', async ({ params, request }) => {
    const body = (await request.json()) as { status: string; parcels?: number; note?: string }
    // REFUNDED is derived from the refund request, so it is not a status a
    // client may declare - accepting one here would create the second source of
    // truth the derivation exists to avoid.
    if (body.status === 'REFUNDED') {
      return HttpResponse.json(
        {
          type: 'https://api/errors/validation',
          title: 'Validation failed',
          status: 422,
          detail: 'REFUNDED is derived from the order\'s refund request, not set directly.',
          errors: [{ field: 'status', reason: 'is derived and cannot be written' }],
        },
        { status: 422 },
      )
    }
    const order = findSellerOrder(params.orderId as string)
    if (!order) {
      return HttpResponse.json({ type: 'about:blank', title: 'Not found', status: 404 }, { status: 404 })
    }

    // The same state machine the contract describes: the seller owns packing
    // and handover, and nothing else.
    const legal =
      (body.status === 'PACKED' && order.status === 'PLACED') ||
      (body.status === 'SHIPPED' && ['PLACED', 'PACKED'].includes(order.status))
    if (!legal) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/illegal-transition',
          title: 'Illegal transition',
          status: 409,
          detail: `Cannot move from ${order.status} to ${body.status}`,
        },
        { status: 409 },
      )
    }

    // Stored on the order, not spread onto the response on the way out: the
    // fulfilment fields used to be echoed once and then lost, so the very next
    // GET of the same order answered packedAt: null and the log forgot that the
    // seller had packed anything.
    const updated = updateSellerOrder(order.id, {
      status: body.status as typeof order.status,
      ...(body.parcels != null ? { parcels: body.parcels } : {}),
      ...(body.status === 'PACKED' ? { packedAt: new Date().toISOString() } : {}),
      ...(body.status === 'SHIPPED'
        ? { trackingNumber: `AZ${order.id.replace(/-/g, '').slice(-8).toUpperCase()}`, shippedAt: new Date().toISOString() }
        : {}),
    })!
    return HttpResponse.json(sellerOrderRowDetailOf(updated))
  }),

  http.get('http://localhost:8080/api/v1/sellers/me/products', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const status = url.searchParams.get('status')
    const categorySlug = url.searchParams.get('categorySlug')
    const stockBelow = url.searchParams.get('stockBelow')
    const sort = url.searchParams.get('sort') ?? 'newest'
    const page = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 20)

    let rows = listSellerProductRows().filter((row) => {
      if (q && !`${row.title} ${row.brandName ?? ''}`.toLowerCase().includes(q)) return false
      if (status && row.status !== status) return false
      if (categorySlug && row.category.slug !== categorySlug) return false
      if (stockBelow && row.totalStock >= Number(stockBelow)) return false
      return true
    })

    const by: Record<string, (a: typeof rows[number], b: typeof rows[number]) => number> = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
      title_asc: (a, b) => a.title.localeCompare(b.title),
      title_desc: (a, b) => b.title.localeCompare(a.title),
      stock_asc: (a, b) => a.totalStock - b.totalStock,
      price_asc: (a, b) => (a.priceFrom ?? 0) - (b.priceFrom ?? 0),
      price_desc: (a, b) => (b.priceFrom ?? 0) - (a.priceFrom ?? 0),
    }
    rows = [...rows].sort(by[sort] ?? by.newest)

    return HttpResponse.json({
      content: rows.slice(page * size, page * size + size),
      page,
      totalElements: rows.length,
      totalPages: Math.ceil(rows.length / size) || 1,
    })
  }),

  http.get('http://localhost:8080/api/v1/orders', ({ request }) => {
    if (!currentBuyer()) return unauthorized()
    const url = new URL(request.url)
    const group = url.searchParams.get('group') ?? 'all'
    const q = url.searchParams.get('q')?.toLowerCase()
    const page = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 10)

    const filtered = listBuyerOrders().filter((order) => {
      if (!inBuyerGroup(order, group)) return false
      if (q) {
        const haystack = [order.reference, ...(order.previewLines ?? []).map((l) => l.productTitle)]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    return HttpResponse.json({
      content: filtered.slice(page * size, page * size + size),
      page,
      totalElements: filtered.length,
      totalPages: Math.ceil(filtered.length / size) || 1,
    })
  }),

  http.get('http://localhost:8080/api/v1/orders/:orderId', ({ params }) => {
    const order = findBuyerOrder(params.orderId as string)
    if (!order) {
      return HttpResponse.json({ type: 'about:blank', title: 'Not found', status: 404 }, { status: 404 })
    }
    return HttpResponse.json(buyerOrderDetailOf(order))
  }),

  http.post('http://localhost:8080/api/v1/refund-requests', async ({ request }) => {
    const body = (await request.json()) as {
      orderId: string
      lines: { orderLineId: string; quantity: number }[]
      resolution: 'REFUND' | 'REPLACEMENT'
      payout: 'ORIGINAL_PAYMENT' | 'ALTERNATE_METHOD' | null
      detail: string
    }
    const order = findBuyerOrder(body.orderId)
    if (!order) {
      return HttpResponse.json({ type: 'about:blank', title: 'Not found', status: 404 }, { status: 404 })
    }
    if (body.detail.trim().length < 20) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/validation',
          title: 'Validation failed',
          status: 422,
          errors: [{ field: 'detail', reason: 'at least 20 characters' }],
        },
        { status: 422 },
      )
    }

    const lines = body.lines.map((requested) => {
      const line = order.lines.find((l) => l.id === requested.orderLineId)!
      return {
        orderLineId: requested.orderLineId,
        productTitle: line.productTitle,
        variantLabel: line.variantLabel,
        quantity: requested.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.unitPrice * requested.quantity,
      }
    })
    const requestedAmount = lines.reduce((sum, l) => sum + l.lineTotal, 0)

    const created = {
        id: crypto.randomUUID(),
        reference: 'ref_' + Math.random().toString(16).slice(2, 10),
        status: 'REQUESTED' as const,
        resolution: body.resolution,
        payout: body.payout ?? 'ORIGINAL_PAYMENT',
        detail: body.detail,
        requestedAt: new Date().toISOString(),
        requestedAmount,
        approvedAmount: null,
        currency: order.currency,
        orderId: order.id,
        orderReference: order.reference,
        orderPlacedAt: order.placedAt,
        buyerName: order.shippingAddress.fullName,
        buyerEmail: null,
        seller: order.seller,
        paymentMethod: null,
        lines,
    }

    // Only into the refund store. The order's refund fields - its request
    // list, its per-line flags and canRequestRefund - are all read back out of
    // it, so nothing has to be copied onto the order and nothing can go stale
    // there when the seller settles this request.
    addRefundRequest(created)

    return HttpResponse.json(created, { status: 201 })
  }),

  http.get('http://localhost:8080/api/v1/refund-requests/:refundRequestId', ({ params }) => {
    const found = findRefundRequest(params.refundRequestId as string)
    if (!found) {
      return HttpResponse.json({ type: 'about:blank', title: 'Not found', status: 404 }, { status: 404 })
    }
    return HttpResponse.json(found)
  }),

  http.patch('http://localhost:8080/api/v1/refund-requests/:refundRequestId', async ({ params, request }) => {
    const body = (await request.json()) as {
      status: Parameters<typeof canTransition>[1]
      resolution?: 'REFUND' | 'REPLACEMENT'
      approvedAmount?: number
      declineReason?: string
      returnTrackingNumber?: string
      note?: string
    }
    const found = findRefundRequest(params.refundRequestId as string)
    if (!found) {
      return HttpResponse.json({ type: 'about:blank', title: 'Not found', status: 404 }, { status: 404 })
    }
    if (!canTransition(found.status, body.status)) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/illegal-transition',
          title: 'Illegal transition',
          status: 409,
          detail: `Cannot move from ${found.status} to ${body.status}`,
        },
        { status: 409 },
      )
    }
    if (body.approvedAmount != null && body.approvedAmount > found.requestedAmount) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/validation',
          title: 'Validation failed',
          status: 422,
          errors: [{ field: 'approvedAmount', reason: 'cannot exceed the requested amount' }],
        },
        { status: 422 },
      )
    }

    const now = new Date().toISOString()
    const stamps: Record<string, Record<string, string>> = {
      APPROVED: { approvedAt: now },
      AWAITING_RETURN: { approvedAt: found.approvedAt ?? now },
      RETURN_RECEIVED: { returnReceivedAt: now },
      REFUNDED: { refundedAt: now },
      REPLACEMENT_SENT: { replacementSentAt: now },
      DECLINED: { declinedAt: now },
    }

    return HttpResponse.json(
      updateRefundRequest(found.id, {
        status: body.status,
        // The seller may settle a replacement request with money, or the
        // reverse. Absent means they did not change the buyer's ask.
        resolution: body.resolution ?? found.resolution,
        approvedAmount: body.approvedAmount ?? found.approvedAmount,
        declineReason: body.declineReason ?? found.declineReason,
        returnTrackingNumber: body.returnTrackingNumber ?? found.returnTrackingNumber,
        // The note is recorded against the transition it accompanied. It used
        // to be accepted and dropped, so a seller wrote it believing the buyer
        // would see it and nobody ever did.
        events: [
          ...(found.events ?? []),
          { status: body.status, at: now, note: body.note?.trim() || null },
        ],
        ...(stamps[body.status] ?? {}),
      }),
    )
  }),

  http.get('http://localhost:8080/api/v1/sellers/me/refund-requests', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const q = url.searchParams.get('q')?.toLowerCase()
    const page = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 20)

    const rows = listRefundRequests()
      .filter((row) => {
        if (status && row.status !== status) return false
        if (q) {
          const haystack = [row.buyerName, row.buyerEmail, row.orderReference, row.reference]
            .concat(row.lines.map((l) => l.productTitle))
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(q)) return false
        }
        return true
      })
      .map(summaryOfRefund)

    return HttpResponse.json({
      content: rows.slice(page * size, page * size + size),
      page,
      totalElements: rows.length,
      totalPages: Math.ceil(rows.length / size) || 1,
    })
  }),

  // The system reference lists. Both are public, and both are what their selectors
  // read - so a test cannot pick a category or country the API would refuse.
  http.get('http://localhost:8080/categories', () => HttpResponse.json(systemCategories)),
  http.get('http://localhost:8080/countries', () => HttpResponse.json(mockCountries)),

  http.post('http://localhost:8080/auth/buyer/magic-link', async ({ request }) => {
    const { email } = (await request.json()) as { email: string }
    issueMagicLinkToken(email)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('http://localhost:8080/auth/buyer/verify', async ({ request }) => {
    const { token } = (await request.json()) as { token: string }
    const consumed = consumeMagicLinkToken(token)
    if (!consumed) {
      return HttpResponse.json(
        { type: 'https://api/errors/invalid-token', title: 'Invalid or expired token', status: 401 },
        { status: 401 },
      )
    }
    const identity = signInBuyerSession({ buyerIdentityId: consumed.sellerId, email: consumed.email })
    return HttpResponse.json({
      buyerIdentityId: identity.identityId,
      email: identity.email,
      fullName: identity.fullName,
    })
  }),

  /**
   * Buyer-scoped, exactly as SecurityConfig has it: hasRole("BUYER"), so a seller
   * session gets a 403 here. The mock enforces it because a permissive mock is how
   * the /account sign-out bug survived a green test suite - the app called this
   * route with a seller cookie and only production said no.
   */
  http.delete('http://localhost:8080/auth/buyer/session', () => {
    const identity = currentSessionIdentity()
    if (identity?.identityType !== 'BUYER') {
      return HttpResponse.json(
        {
          type: 'https://api/errors/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'Access is denied',
        },
        { status: 403 },
      )
    }
    clearSellerSession()
    return new HttpResponse(null, { status: 204 })
  }),

  /**
   * Whether the signed-in buyer may review this product. Mirrors the backend's three
   * answers: 401 with no buyer session, ALREADY_REVIEWED once they have, and
   * NOT_PURCHASED unless the test says they bought it.
   */
  http.get('http://localhost:8080/products/:productRef/reviews/eligibility', ({ params }) => {
    const identity = currentSessionIdentity()
    if (!identity || identity.identityType !== 'BUYER') {
      return HttpResponse.json(
        { type: 'https://api/errors/unauthorized', title: 'Unauthorized', status: 401 },
        { status: 401 },
      )
    }
    const detail = productDetails[params.productRef as string]
    if (!detail) return notFound()

    const existing = writtenReviewsFor(detail.id)[0]
    if (existing) {
      return HttpResponse.json({
        eligible: false,
        reason: 'ALREADY_REVIEWED',
        orderLineId: null,
        existingReview: existing,
      })
    }
    const orderLineId = purchasedLineFor(detail.id)
    if (!orderLineId) {
      return HttpResponse.json({
        eligible: false,
        reason: 'NOT_PURCHASED',
        orderLineId: null,
        existingReview: null,
      })
    }
    return HttpResponse.json({ eligible: true, reason: null, orderLineId, existingReview: null })
  }),

  /**
   * Writing a review. The mock enforces the same gates the server does, so a test
   * cannot pass by skipping them: a buyer session, and a purchase this fixture knows
   * about.
   */
  http.post('http://localhost:8080/reviews', async ({ request }) => {
    const identity = currentSessionIdentity()
    if (!identity || identity.identityType !== 'BUYER') {
      return HttpResponse.json(
        { type: 'https://api/errors/unauthorized', title: 'Unauthorized', status: 401 },
        { status: 401 },
      )
    }
    const body = (await request.json()) as { orderLineId: string; rating: number; body?: string | null }
    const productId = productIdForPurchasedLine(body.orderLineId)
    if (!productId) {
      return HttpResponse.json(
        { type: 'https://api/errors/forbidden', title: 'Forbidden', status: 403 },
        { status: 403 },
      )
    }
    if (writtenReviewsFor(productId).length > 0) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/already-reviewed',
          title: 'Already reviewed',
          status: 409,
          detail: 'You have already reviewed this product',
        },
        { status: 409 },
      )
    }
    const review = {
      id: crypto.randomUUID(),
      rating: body.rating,
      body: body.body ?? null,
      variantLabel: productDetails[productId]?.variants[0]?.label ?? null,
      createdAt: new Date().toISOString(),
      reviewerName: identity.fullName ?? identity.email,
    }
    addWrittenReview(productId, review)
    return HttpResponse.json(review, { status: 201 })
  }),

  http.patch('http://localhost:8080/api/v1/reviews/:reviewId', async ({ params, request }) => {
    const identity = currentSessionIdentity()
    if (!identity || identity.identityType !== 'BUYER') return unauthorized()

    const body = (await request.json()) as { rating?: number; body?: string | null }
    if (body.rating != null && (body.rating < 1 || body.rating > 5)) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/validation',
          title: 'Validation failed',
          status: 422,
          errors: [{ field: 'rating', reason: 'must be between 1 and 5' }],
        },
        { status: 422 },
      )
    }
    const updated = updateWrittenReview(String(params.reviewId), body)
    if (updated === 'not-found') return notFound()
    return HttpResponse.json(updated)
  }),

  /**
   * The role-agnostic sign-out. Mirrors the backend's DELETE /sessions/current:
   * it revokes whichever session the cookie names, buyer or seller, which is the
   * whole reason it exists - the buyer-scoped route 403'd for a signed-in seller
   * and made sign-out look dead on /account.
   */
  http.delete('http://localhost:8080/sessions/current', () => {
    if (!currentSessionIdentity()) {
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
    clearSellerSession()
    return new HttpResponse(null, { status: 204 })
  }),

  /**
   * The signed-in buyer's last delivery details. 204 for someone who has not
   * ordered before - not an error, just an empty form. Tests opt in by calling
   * setLastCheckoutDetails; the default is "no previous order".
   */
  http.get('http://localhost:8080/checkout/last-details', () => {
    const identity = currentSessionIdentity()
    if (!identity || identity.identityType !== 'BUYER') {
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
    const details = currentLastCheckoutDetails()
    if (!details) return new HttpResponse(null, { status: 204 })
    return HttpResponse.json(details)
  }),

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
    if (typeof patch.categorySlug === 'string') {
      const category = systemCategories.find((c) => c.slug === patch.categorySlug)
      if (!category) {
        return HttpResponse.json(
          {
            type: 'https://api/errors/not-found',
            title: 'Not found',
            status: 404,
            detail: `Category '${patch.categorySlug}' does not exist or is no longer available`,
          },
          { status: 404 },
        )
      }
      // The detail store holds the resolved pair, not the slug that was sent.
      delete patch.categorySlug
      patch.category = category
    }
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
      categorySlug: string
      variants: unknown[]
    }
    // The category has to exist, exactly as the backend requires - a mock that
    // accepted anything would let a test pass against a request production refuses.
    const category = systemCategories.find((c) => c.slug === body.categorySlug)
    if (!category) {
      return HttpResponse.json(
        {
          type: 'https://api/errors/not-found',
          title: 'Not found',
          status: 404,
          detail: `Category '${body.categorySlug}' does not exist or is no longer available`,
        },
        { status: 404 },
      )
    }
    const id = crypto.randomUUID()
    addSellerProduct({
      id,
      slug: mockSlug(body.title),
      title: body.title,
      thumbnailUrl: null,
      category,
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
  http.put(
    'http://localhost:8080/api/v1/products/:productId/images/order',
    async ({ params, request }) => {
      const { imageIds } = (await request.json()) as { imageIds: string[] }
      const result = reorderSellerImages(String(params.productId), imageIds)
      if (result === 'not-found') return notFound()
      if (result === 'mismatch') {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Unprocessable Entity',
            status: 422,
            detail: 'The list must name every image of this product exactly once.',
            errors: [{ field: 'imageIds', reason: 'must name every image exactly once' }],
          },
          { status: 422 },
        )
      }
      return HttpResponse.json(findSellerProductDetail(String(params.productId))!.images)
    },
  ),
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

  http.get('http://localhost:8080/products/:productRef/reviews', ({ params, request }) => {
    const detail = productDetails[params.productRef as string]
    if (!detail) return notFound()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 10)

    // Newest first, so a review written during the test appears above the seeded
    // ones - the same order the API returns.
    const all = [...writtenReviewsFor(detail.id), ...reviewsFor(detail.id)]
    const content = all.slice(page * size, page * size + size)

    return HttpResponse.json({
      content,
      page,
      totalElements: all.length,
      totalPages: Math.ceil(all.length / size) || 1,
    })
  }),

  // Resolves a slug or a legacy id - productDetails is keyed by both, as the API
  // resolves both.
  http.get('http://localhost:8080/products/:productRef', ({ params }) => {
    const detail = productDetails[params.productRef as string]
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
      // Matched on the SLUG, which is what a ?category= filter carries.
      if (category && p.category.slug !== category) return false
      if (priceMin && p.priceFrom < Number(priceMin)) return false
      if (priceMax && p.priceFrom > Number(priceMax)) return false
      if (inStockOnly && !p.inStock) return false
      return true
    })

    // Store refs brought up to date, so a card links to the handle the store has
    // now rather than the one the catalogue fixture was written with.
    const content = listingsWithStore(filtered.slice(page * size, page * size + size))

    return HttpResponse.json({
      content,
      page,
      totalElements: filtered.length,
      totalPages: Math.ceil(filtered.length / size) || 1,
    })
  }),
]
