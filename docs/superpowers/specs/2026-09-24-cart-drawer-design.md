# Cart drawer — design spec

Date: 2026-09-24
Status: approved

## Goal

Client-side shopping cart (no server table) as a right-side drawer, opened from
a cart icon in the shared `AppHeader` and re-opened whenever an item is added
from the product card or the product detail page. Full CRUD, `localStorage`
persistence, and visible (not silent) handling of stale cart state.

## Data model

No `Offer` entity is ever exposed over the API — `offer.price`/`offer.stockQty`
are always flattened onto `variant` (confirmed in `docs/api-design.md` and
`ProductController`). The addressable id used everywhere, including the
checkout contract (`POST /orders` line `{variantId, quantity}`), is
`variant.id`. The cart therefore stores variant ids, not a separate "offer id":

```ts
interface CartLine {
  variantId: string
  quantity: number
  priceWhenAdded: number
}
```

`priceWhenAdded` is not used for display — the drawer always renders the live
fetched price. It exists only as a diff baseline to detect "price changed
since added," which is otherwise undetectable with no server-side cart. It is
refreshed to the current live price whenever the same line is incremented
(the user just re-confirmed at today's price) or when the user dismisses a
price-change notice.

Nothing else (title, image, variant label, current price, stock) is stored.
`quantity` and `priceWhenAdded` are the only additional fields beyond the id.

## API gap — flagged

No batch-by-ids endpoint exists or is spec'd anywhere in the repo. The only
implemented/spec'd reads are `GET /products` (search) and `GET
/products/{id}` (one product, all its variants) — neither takes an arbitrary
list of variant ids.

This feature adds the contract the frontend needs to `frontend/openapi/fixture.yaml`
(the repo's existing convention for spec'ing ahead of the backend):

```yaml
/variants:
  get:
    operationId: getVariantsByIds
    parameters:
      - name: ids
        in: query
        required: true
        schema: { type: string }   # comma-separated variant ids
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: array
              items: { $ref: '#/components/schemas/VariantOffer' }
      default: { ... ProblemDetail ... }

VariantOffer:
  required: [id, productId, productTitle, variantLabel, price, stockQty]
  properties:
    id: string
    productId: string
    productTitle: string
    variantLabel: string
    thumbnailUrl: string, nullable
    price: number
    stockQty: integer
```

Ids not found are simply absent from the response array (never an error) —
that absence is exactly the "offer no longer exists" signal.

**This needs a real Spring controller + repository query that does not exist
today.** Out of scope for this change; `schema.d.ts` is regenerated from the
fixture so the frontend is fully typed against the contract, and MSW mocks it
for tests only. Until the backend implements it, the drawer will error in a
real dev environment exactly like any other unimplemented endpoint (visible
error + retry, same as the existing "Couldn't load products" pattern) —
this is a known, flagged gap, not a bug.

## Fetching

One `useQuery` call per drawer-open, keyed by the sorted+joined set of
variant ids currently in the cart:

```ts
useQuery({
  queryKey: ['cart', 'offers', sortedIds],
  queryFn: () => apiClient.GET('/variants', { params: { query: { ids: sortedIds.join(',') } } }),
  enabled: isOpen && ids.length > 0,
  staleTime: 0,
})
```

`enabled` on `isOpen` means it fetches once per open (not on every render, not
on every localStorage change), satisfying "price/stock come from the server on
read." One call regardless of line count.

## Stale-state handling

Computed per line by matching `CartLine.variantId` against the batch response:

| Case | Detection | Shown | User can |
|---|---|---|---|
| Offer gone | id absent from response | "No longer available" badge, row dimmed, qty/price controls hidden | Remove only |
| Out of stock | `stockQty === 0` | "Out of stock" badge | Remove (qty locked) |
| Stock below cart qty | `0 < stockQty < quantity` | "Only N left" warning, qty control capped at N | Adjust down or remove |
| Price changed | `price !== priceWhenAdded` | inline "Price updated: was $X, now $Y", line total uses live price | Dismiss (resets baseline) or remove |

A line can be both low-stock and price-changed at once; both render.

## Components — `frontend/src/features/cart/`

```
schema/types.ts          CartLine, VariantOffer (generated schema re-export)
storage.ts                localStorage read/write, guarded (private-mode/parse failures)
context/cartReducer.ts    pure reducer: ADD/SET_QTY/REMOVE/CLEAR + dedup-increment math
context/CartContext.tsx   provider wiring useReducer + storage sync + open/close state
api/useCartOffers.ts      the batch query above
api/useAddToCartFromProduct.ts   card path: fetch product, resolve default variant, add
components/CartDrawer.tsx        shadcn Sheet, right side, scrollable list + pinned footer
components/CartLineRow.tsx       one line incl. all 4 stale-state renders
components/CartTrigger.tsx       icon button + badge, mounted in AppHeader
```

`npx shadcn add sheet` is required (pulls in `@radix-ui/react-dialog`; no
Sheet/Dialog primitive exists in the repo yet).

### Wiring into the existing app

- `CartProvider` wraps `RouterProvider` in `App.tsx` (next to the existing
  `QueryClientProvider`) so both routes and the header share one cart.
- `AppHeader` (already shared by both pages post-merge) gets `<CartTrigger />`
  next to the search form.
- `catalog/api/useAddToCart.ts`'s stub body is replaced with a call into
  `useCart().addLine(variantId, quantity, price)` + `open()`. Its existing
  test (`ProductDetail.test.tsx`, asserts a `console.info('[stub] addToCart', ...)`
  call) is updated to assert the cart line instead.
- `search/components/ProductCard.tsx`'s inert "Add to cart" button gets
  `useAddToCartFromProduct(product.id)`, which does an imperative
  `GET /products/{id}` on click, picks the first in-stock variant (else the
  first), and calls the same `addLine` + `open()`. This is one extra request
  per card-click — acceptable, and reuses the existing detail endpoint rather
  than inventing a second one.
- Checkout button in the footer is rendered but inert (`// ponytail:` comment)
  — no checkout flow exists yet.

## Testing

Vitest + Testing Library, MSW for the batch endpoint (test-only mock, per the
gap above).

- `cartReducer.test.ts` — pure, no rendering: increment-on-duplicate math
  (quantity adds, `priceWhenAdded` refreshes), set/remove/clear, dedup by
  variant id.
- `storage.test.ts` — round-trip through `localStorage`, corrupt/missing data
  falls back to empty cart.
- `CartDrawer.test.tsx` — MSW-mocked batch responses for each of the four
  stale-state rows, empty state, footer total, add-from-card and
  add-from-detail-page flows (via the existing pages), Escape-to-close,
  focus trap smoke test.

## Explicitly out of scope

- Checkout flow (button is inert).
- The backend `/variants` controller (flagged gap above).
- Server-side cart / order persistence.
