# Cart Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side (localStorage-only) shopping cart drawer: full CRUD on cart lines, live price/stock/title fetched from the server in one batch call per open, visible handling of four stale-cart cases, wired into the existing product card and product detail page.

**Architecture:** A `CartProvider` (React Context + `useReducer`, no new state library) holds `{variantId, quantity, priceWhenAdded}[]` and syncs it to `localStorage`. A `useCartOffers` React Query hook fetches live data for the cart's variant ids in one request when the drawer opens. A shadcn `Sheet` (hand-authored from `@radix-ui/react-dialog`, not yet in this repo) renders the drawer, diffing each stored line against the fetched offer to decide which of four states to show.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query v5, react-router v8, Tailwind v4 + existing design tokens, `@radix-ui/react-dialog` (new), Vitest + Testing Library + MSW (existing).

## Global Constraints

- No new CSS — shadcn components and the existing `index.css` design tokens only.
- Cart is client-side only: no server table, `localStorage` is the only persistence.
- A cart line stores only `variantId`, `quantity`, and `priceWhenAdded` (a diff baseline, never displayed) — everything else renders from the live server response.
- Exactly one batch HTTP call (`GET /variants?ids=...`) per drawer open, never one call per line.
- Every stale-state (offer gone / out of stock / stock below cart quantity / price changed) renders a visible state on the line — never a silent drop.
- MSW mocks the new `/variants` endpoint for tests (and the existing dev-mode `VITE_USE_MSW` path, matching how every other endpoint in this repo is already mocked) — no real backend controller is added; that gap is flagged, not filled, by this plan.
- Drawer is a shadcn `Sheet` sliding from the right, full-width (or near it) below the `sm` breakpoint, with focus trap / Escape-to-close / body scroll lock — all provided by the underlying Radix `Dialog` primitive, not hand-rolled.
- `variantId` is this codebase's name for what the feature request calls "offer id" — there is no separately-addressable `Offer` id anywhere in the API; `offer.price`/`offer.stockQty` are always flattened onto `variant`, and `variant.id` is what checkout's `POST /orders` already expects.

---

### Task 1: Batch `/variants` endpoint — OpenAPI contract only

**Files:**
- Modify: `frontend/openapi/fixture.yaml`
- Modify (generated, do not hand-edit beyond running the script): `frontend/src/lib/api/schema.d.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `components['schemas']['VariantOffer']` type (`id`, `productId`, `productTitle`, `variantLabel`, `thumbnailUrl` nullable, `price`, `stockQty`), and a typed `GET /variants` path taking `{ query: { ids: string } }` (comma-separated ids), usable via `apiClient.GET('/variants', ...)`. Every later task that fetches cart offers depends on this exact shape.

- [ ] **Step 1: Add the `VariantOffer` schema and `/variants` path to the fixture**

Open `frontend/openapi/fixture.yaml`. Add a new path entry alongside the existing `/products/{productId}` entry (insert after the `/products/{productId}/reviews` block, before `components:`):

```yaml
  /variants:
    get:
      operationId: getVariantsByIds
      parameters:
        - name: ids
          in: query
          required: true
          schema: { type: string }
          description: Comma-separated variant ids. Ids that don't exist are simply omitted from the response.
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/VariantOffer' }
        default:
          description: Error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProblemDetail'
```

Then add the `VariantOffer` schema inside `components: schemas:`, next to `ProductVariant`:

```yaml
    VariantOffer:
      type: object
      required: [id, productId, productTitle, variantLabel, price, stockQty]
      properties:
        id: { type: string }
        productId: { type: string, format: uuid }
        productTitle: { type: string }
        variantLabel: { type: string }
        thumbnailUrl: { type: string, nullable: true }
        price: { type: number }
        stockQty: { type: integer }
```

- [ ] **Step 2: Regenerate the typed schema**

Run:
```bash
cd frontend && npm run gen:api
```
Expected: exits 0, rewrites `frontend/src/lib/api/schema.d.ts`.

- [ ] **Step 3: Verify the generated types**

Run:
```bash
grep -n "VariantOffer" frontend/src/lib/api/schema.d.ts
grep -n "\"/variants\"" frontend/src/lib/api/schema.d.ts
```
Expected: both commands print at least one matching line.

- [ ] **Step 4: Commit**

```bash
git add frontend/openapi/fixture.yaml frontend/src/lib/api/schema.d.ts
git commit -m "feat(cart): add /variants batch endpoint to the frontend API contract"
```

---

### Task 2: Cart types + localStorage persistence

**Files:**
- Create: `frontend/src/features/cart/schema/types.ts`
- Create: `frontend/src/features/cart/storage.ts`
- Create: `frontend/src/features/cart/storage.test.ts`
- Modify: `frontend/src/test/setup.ts`

**Interfaces:**
- Consumes: `components['schemas']['VariantOffer']` from Task 1.
- Produces: `CartLine { variantId: string; quantity: number; priceWhenAdded: number }`, `VariantOffer` (re-export), `loadCart(): CartLine[]`, `saveCart(lines: CartLine[]): void`. Task 3's reducer and Task 4's context both import these.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/cart/storage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadCart, saveCart } from './storage'

describe('cart storage', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty array when nothing is stored', () => {
    expect(loadCart()).toEqual([])
  })

  it('round-trips lines through localStorage', () => {
    saveCart([{ variantId: 'v1', quantity: 2, priceWhenAdded: 9.99 }])
    expect(loadCart()).toEqual([{ variantId: 'v1', quantity: 2, priceWhenAdded: 9.99 }])
  })

  it('returns an empty array for corrupt JSON instead of throwing', () => {
    localStorage.setItem('cart:v1', '{not json')
    expect(loadCart()).toEqual([])
  })

  it('drops malformed entries but keeps valid ones', () => {
    localStorage.setItem(
      'cart:v1',
      JSON.stringify([{ variantId: 'v1', quantity: 1, priceWhenAdded: 5 }, { quantity: 1 }, null]),
    )
    expect(loadCart()).toEqual([{ variantId: 'v1', quantity: 1, priceWhenAdded: 5 }])
  })

  it('does not throw when storage write fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveCart([{ variantId: 'v1', quantity: 1, priceWhenAdded: 5 }])).not.toThrow()
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/cart/storage.test.ts`
Expected: FAIL — `storage.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the types and storage module**

Create `frontend/src/features/cart/schema/types.ts`:

```ts
import type { components } from '@/lib/api/schema'

export type VariantOffer = components['schemas']['VariantOffer']

export interface CartLine {
  variantId: string
  quantity: number
  priceWhenAdded: number
}
```

Create `frontend/src/features/cart/storage.ts`:

```ts
import type { CartLine } from './schema/types'

const STORAGE_KEY = 'cart:v1'

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Record<string, unknown>
  return (
    typeof line.variantId === 'string' &&
    typeof line.quantity === 'number' &&
    typeof line.priceWhenAdded === 'number'
  )
}

export function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCartLine)
  } catch {
    return []
  }
}

export function saveCart(lines: CartLine[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  } catch {
    // private browsing / storage disabled / quota exceeded - cart just won't persist
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/cart/storage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Clear localStorage between every test globally**

Every later cart test relies on a clean `localStorage` per test. Modify `frontend/src/test/setup.ts` to add this after the existing `afterEach(() => server.resetHandlers())` line:

```ts
afterEach(() => server.resetHandlers())
afterEach(() => localStorage.clear())
```

(Full file after the edit — for reference, don't recreate it, just add the one line:)

```ts
import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './msw/server'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterEach(() => localStorage.clear())
afterAll(() => server.close())
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/cart/schema/types.ts frontend/src/features/cart/storage.ts frontend/src/features/cart/storage.test.ts frontend/src/test/setup.ts
git commit -m "feat(cart): add cart types and localStorage persistence"
```

---

### Task 3: Pure cart reducer — CRUD + dedup math

**Files:**
- Create: `frontend/src/features/cart/context/cartReducer.ts`
- Create: `frontend/src/features/cart/context/cartReducer.test.ts`

**Interfaces:**
- Consumes: `CartLine` from Task 2.
- Produces: `CartAction` union and `cartReducer(lines: CartLine[], action: CartAction): CartLine[]`, actions `ADD`, `SET_QUANTITY`, `REMOVE`, `CLEAR`, `ACKNOWLEDGE_PRICE`. Task 4's `CartContext` dispatches these exact action shapes.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/cart/context/cartReducer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { cartReducer } from './cartReducer'
import type { CartLine } from '../schema/types'

describe('cartReducer', () => {
  it('ADD appends a new line', () => {
    const result = cartReducer([], { type: 'ADD', variantId: 'v1', quantity: 2, price: 10 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 2, priceWhenAdded: 10 }])
  })

  it('ADD on an existing variant increments quantity instead of duplicating', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'ADD', variantId: 'v1', quantity: 2, price: 10 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 3, priceWhenAdded: 10 }])
  })

  it('ADD on an existing variant refreshes the price baseline to the price just used', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'ADD', variantId: 'v1', quantity: 1, price: 12 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 2, priceWhenAdded: 12 }])
  })

  it('ADD does not affect other lines', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'ADD', variantId: 'v2', quantity: 1, price: 5 })
    expect(result).toEqual([
      { variantId: 'v1', quantity: 1, priceWhenAdded: 10 },
      { variantId: 'v2', quantity: 1, priceWhenAdded: 5 },
    ])
  })

  it('SET_QUANTITY updates only the matching line', () => {
    const initial: CartLine[] = [
      { variantId: 'v1', quantity: 1, priceWhenAdded: 10 },
      { variantId: 'v2', quantity: 1, priceWhenAdded: 5 },
    ]
    const result = cartReducer(initial, { type: 'SET_QUANTITY', variantId: 'v1', quantity: 4 })
    expect(result).toEqual([
      { variantId: 'v1', quantity: 4, priceWhenAdded: 10 },
      { variantId: 'v2', quantity: 1, priceWhenAdded: 5 },
    ])
  })

  it('SET_QUANTITY clamps to a minimum of 1', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 3, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'SET_QUANTITY', variantId: 'v1', quantity: 0 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }])
  })

  it('REMOVE drops only the matching line', () => {
    const initial: CartLine[] = [
      { variantId: 'v1', quantity: 1, priceWhenAdded: 10 },
      { variantId: 'v2', quantity: 1, priceWhenAdded: 5 },
    ]
    const result = cartReducer(initial, { type: 'REMOVE', variantId: 'v1' })
    expect(result).toEqual([{ variantId: 'v2', quantity: 1, priceWhenAdded: 5 }])
  })

  it('CLEAR empties the cart', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 1, priceWhenAdded: 10 }]
    expect(cartReducer(initial, { type: 'CLEAR' })).toEqual([])
  })

  it('ACKNOWLEDGE_PRICE updates the baseline without changing quantity', () => {
    const initial: CartLine[] = [{ variantId: 'v1', quantity: 3, priceWhenAdded: 10 }]
    const result = cartReducer(initial, { type: 'ACKNOWLEDGE_PRICE', variantId: 'v1', price: 15 })
    expect(result).toEqual([{ variantId: 'v1', quantity: 3, priceWhenAdded: 15 }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/cart/context/cartReducer.test.ts`
Expected: FAIL — `cartReducer.ts` does not exist yet.

- [ ] **Step 3: Write the reducer**

Create `frontend/src/features/cart/context/cartReducer.ts`:

```ts
import type { CartLine } from '../schema/types'

export type CartAction =
  | { type: 'ADD'; variantId: string; quantity: number; price: number }
  | { type: 'SET_QUANTITY'; variantId: string; quantity: number }
  | { type: 'REMOVE'; variantId: string }
  | { type: 'CLEAR' }
  | { type: 'ACKNOWLEDGE_PRICE'; variantId: string; price: number }

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'ADD': {
      const existing = lines.find((line) => line.variantId === action.variantId)
      if (existing) {
        return lines.map((line) =>
          line.variantId === action.variantId
            ? { ...line, quantity: line.quantity + action.quantity, priceWhenAdded: action.price }
            : line,
        )
      }
      return [...lines, { variantId: action.variantId, quantity: action.quantity, priceWhenAdded: action.price }]
    }
    case 'SET_QUANTITY':
      return lines.map((line) =>
        line.variantId === action.variantId ? { ...line, quantity: Math.max(1, action.quantity) } : line,
      )
    case 'REMOVE':
      return lines.filter((line) => line.variantId !== action.variantId)
    case 'CLEAR':
      return []
    case 'ACKNOWLEDGE_PRICE':
      return lines.map((line) =>
        line.variantId === action.variantId ? { ...line, priceWhenAdded: action.price } : line,
      )
    default:
      return lines
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/cart/context/cartReducer.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/cart/context/cartReducer.ts frontend/src/features/cart/context/cartReducer.test.ts
git commit -m "feat(cart): add pure cart reducer with dedup-increment math"
```

---

### Task 4: CartContext provider

**Files:**
- Create: `frontend/src/features/cart/context/CartContext.tsx`
- Create: `frontend/src/features/cart/context/CartContext.test.tsx`

**Interfaces:**
- Consumes: `cartReducer`/`CartAction` from Task 3, `loadCart`/`saveCart` from Task 2.
- Produces: `CartProvider` (component) and `useCart()` returning `{ lines: CartLine[]; itemCount: number; isOpen: boolean; open(): void; close(): void; addLine(variantId: string, quantity: number, price: number): void; setQuantity(variantId: string, quantity: number): void; removeLine(variantId: string): void; clear(): void; acknowledgePrice(variantId: string, price: number): void }`. Every remaining task (`useCartOffers`, `CartDrawer`, `CartTrigger`, `useAddToCart`, `useAddToCartFromProduct`, `App.tsx`) consumes this exact API.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/cart/context/CartContext.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CartProvider, useCart } from './CartContext'

function setup() {
  return renderHook(() => useCart(), { wrapper: CartProvider })
}

describe('CartContext', () => {
  it('starts empty and closed', () => {
    const { result } = setup()
    expect(result.current.lines).toEqual([])
    expect(result.current.itemCount).toBe(0)
    expect(result.current.isOpen).toBe(false)
  })

  it('addLine adds a new line and opens the drawer', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 2, 10))
    expect(result.current.lines).toEqual([{ variantId: 'v1', quantity: 2, priceWhenAdded: 10 }])
    expect(result.current.itemCount).toBe(2)
    expect(result.current.isOpen).toBe(true)
  })

  it('addLine on an existing variant increments rather than duplicating', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 1, 10))
    act(() => result.current.addLine('v1', 2, 12))
    expect(result.current.lines).toEqual([{ variantId: 'v1', quantity: 3, priceWhenAdded: 12 }])
  })

  it('persists lines to localStorage as they change', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 1, 10))
    expect(JSON.parse(localStorage.getItem('cart:v1')!)).toEqual([
      { variantId: 'v1', quantity: 1, priceWhenAdded: 10 },
    ])
  })

  it('loads persisted lines on mount', () => {
    localStorage.setItem('cart:v1', JSON.stringify([{ variantId: 'v1', quantity: 5, priceWhenAdded: 20 }]))
    const { result } = setup()
    expect(result.current.lines).toEqual([{ variantId: 'v1', quantity: 5, priceWhenAdded: 20 }])
    expect(result.current.itemCount).toBe(5)
  })

  it('removeLine removes only the matching line', () => {
    const { result } = setup()
    act(() => {
      result.current.addLine('v1', 1, 10)
      result.current.addLine('v2', 1, 5)
    })
    act(() => result.current.removeLine('v1'))
    expect(result.current.lines).toEqual([{ variantId: 'v2', quantity: 1, priceWhenAdded: 5 }])
  })

  it('clear empties the cart', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 1, 10))
    act(() => result.current.clear())
    expect(result.current.lines).toEqual([])
    expect(result.current.itemCount).toBe(0)
  })

  it('close sets isOpen to false', () => {
    const { result } = setup()
    act(() => result.current.addLine('v1', 1, 10))
    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
  })

  it('throws when used outside a CartProvider', () => {
    expect(() => renderHook(() => useCart())).toThrow('useCart must be used within a CartProvider')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/cart/context/CartContext.test.tsx`
Expected: FAIL — `CartContext.tsx` does not exist yet.

- [ ] **Step 3: Write the provider**

Create `frontend/src/features/cart/context/CartContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import type { ReactNode } from 'react'

import { loadCart, saveCart } from '../storage'
import { cartReducer } from './cartReducer'

interface CartContextValue {
  lines: ReturnType<typeof loadCart>
  itemCount: number
  isOpen: boolean
  open: () => void
  close: () => void
  addLine: (variantId: string, quantity: number, price: number) => void
  setQuantity: (variantId: string, quantity: number) => void
  removeLine: (variantId: string) => void
  clear: () => void
  acknowledgePrice: (variantId: string, price: number) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, undefined, loadCart)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    saveCart(lines)
  }, [lines])

  const itemCount = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines])

  const value: CartContextValue = {
    lines,
    itemCount,
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    addLine: (variantId, quantity, price) => {
      dispatch({ type: 'ADD', variantId, quantity, price })
      setIsOpen(true)
    },
    setQuantity: (variantId, quantity) => dispatch({ type: 'SET_QUANTITY', variantId, quantity }),
    removeLine: (variantId) => dispatch({ type: 'REMOVE', variantId }),
    clear: () => dispatch({ type: 'CLEAR' }),
    acknowledgePrice: (variantId, price) => dispatch({ type: 'ACKNOWLEDGE_PRICE', variantId, price }),
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/cart/context/CartContext.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/cart/context/CartContext.tsx frontend/src/features/cart/context/CartContext.test.tsx
git commit -m "feat(cart): add CartProvider/useCart context"
```

---

### Task 5: MSW mock for the batch endpoint

**Files:**
- Create: `frontend/src/test/msw/fixtures/variants.ts`
- Modify: `frontend/src/test/msw/handlers.ts`

**Interfaces:**
- Consumes: `productDetails` fixture from `frontend/src/test/msw/fixtures/productDetails.ts` (existing), `VariantOffer` type from Task 2.
- Produces: `variantOffers: Record<string, VariantOffer>` and a registered `GET http://localhost:8080/variants` MSW handler. Tasks 6 and 8's tests depend on this handler existing.

- [ ] **Step 1: Create the variant-offer fixture**

Create `frontend/src/test/msw/fixtures/variants.ts`:

```ts
import type { components } from '@/lib/api/schema'

import { productDetails } from './productDetails'

type VariantOffer = components['schemas']['VariantOffer']

export const variantOffers: Record<string, VariantOffer> = Object.fromEntries(
  Object.values(productDetails).flatMap((product) =>
    product.variants.map((variant) => [
      variant.id,
      {
        id: variant.id,
        productId: product.id,
        productTitle: product.title,
        variantLabel: variant.label,
        thumbnailUrl: null,
        price: variant.price,
        stockQty: variant.stockQty,
      } satisfies VariantOffer,
    ]),
  ),
)
```

- [ ] **Step 2: Register the handler**

Modify `frontend/src/test/msw/handlers.ts`. Add the import at the top with the other fixture imports:

```ts
import { variantOffers } from './fixtures/variants'
```

Add this handler as the first entry in the `handlers` array (order doesn't affect matching here, but keep new endpoints grouped together):

```ts
  http.get('http://localhost:8080/variants', ({ request }) => {
    const url = new URL(request.url)
    const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
    const found = ids.map((id) => variantOffers[id]).filter((offer) => offer !== undefined)
    return HttpResponse.json(found)
  }),
```

- [ ] **Step 3: Verify by hand with a quick smoke test**

Create a throwaway test to confirm the handler works, run it, then delete the file (this step verifies the handler in isolation before Task 6 relies on it):

```bash
cat > frontend/src/test/msw/handlers.smoke.test.ts <<'EOF'
import { describe, expect, it } from 'vitest'

describe('variants handler smoke test', () => {
  it('returns the seeded headphones variant', async () => {
    const res = await fetch('http://localhost:8080/variants?ids=11111111-1111-1111-1111-111111111111-v1')
    const body = await res.json()
    expect(body).toEqual([
      expect.objectContaining({ id: '11111111-1111-1111-1111-111111111111-v1', price: 129.99 }),
    ])
  })
})
EOF
cd frontend && npx vitest run src/test/msw/handlers.smoke.test.ts
rm frontend/src/test/msw/handlers.smoke.test.ts
```
Expected: the vitest run shows 1 passed test before the file is deleted.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/test/msw/fixtures/variants.ts frontend/src/test/msw/handlers.ts
git commit -m "test(cart): mock the /variants batch endpoint"
```

---

### Task 6: useCartOffers batch query hook

**Files:**
- Create: `frontend/src/features/cart/api/useCartOffers.ts`
- Create: `frontend/src/features/cart/api/useCartOffers.test.tsx`

**Interfaces:**
- Consumes: `apiClient`/`ProblemDetail` from `@/lib/api/client` (existing), `VariantOffer` from Task 2, MSW handler from Task 5.
- Produces: `useCartOffers(variantIds: string[], enabled: boolean)` — a React Query result whose `.data` is `VariantOffer[] | undefined`. Task 8's `CartDrawer` depends on this exact signature (positional `enabled` boolean, not an options object).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/cart/api/useCartOffers.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { server } from '@/test/msw/server'

import { useCartOffers } from './useCartOffers'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const HEADPHONES_V1 = '11111111-1111-1111-1111-111111111111-v1'
const COOKWARE_V1 = '33333333-3333-3333-3333-333333333333-v1'

describe('useCartOffers', () => {
  it('fetches offers for the given ids in a single call', async () => {
    const { result } = renderHook(() => useCartOffers([HEADPHONES_V1, COOKWARE_V1], true), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((o) => o.id).sort()).toEqual([COOKWARE_V1, HEADPHONES_V1].sort())
  })

  it('omits ids that no longer exist instead of erroring', async () => {
    const { result } = renderHook(() => useCartOffers([HEADPHONES_V1, 'ghost-id'], true), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((o) => o.id)).toEqual([HEADPHONES_V1])
  })

  it('does not fetch when disabled', () => {
    let calls = 0
    server.use(
      http.get('http://localhost:8080/variants', () => {
        calls += 1
        return HttpResponse.json([])
      }),
    )
    renderHook(() => useCartOffers([HEADPHONES_V1], false), { wrapper })
    expect(calls).toBe(0)
  })

  it('does not fetch with an empty id list', () => {
    let calls = 0
    server.use(
      http.get('http://localhost:8080/variants', () => {
        calls += 1
        return HttpResponse.json([])
      }),
    )
    renderHook(() => useCartOffers([], true), { wrapper })
    expect(calls).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/cart/api/useCartOffers.test.tsx`
Expected: FAIL — `useCartOffers.ts` does not exist yet.

- [ ] **Step 3: Write the hook**

Create `frontend/src/features/cart/api/useCartOffers.ts`:

```ts
import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'

import type { VariantOffer } from '../schema/types'

export const cartOffersKeys = {
  all: ['cart', 'offers'] as const,
  byIds: (ids: string[]) => [...cartOffersKeys.all, ids] as const,
}

export function useCartOffers(variantIds: string[], enabled: boolean) {
  const sortedIds = [...variantIds].sort()

  return useQuery<VariantOffer[], ProblemDetail>({
    queryKey: cartOffersKeys.byIds(sortedIds),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/variants', {
        signal,
        params: { query: { ids: sortedIds.join(',') } },
      })
      if (error) throw error
      return data
    },
    enabled: enabled && sortedIds.length > 0,
    staleTime: 0,
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/cart/api/useCartOffers.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/cart/api/useCartOffers.ts frontend/src/features/cart/api/useCartOffers.test.tsx
git commit -m "feat(cart): add useCartOffers batch fetch hook"
```

---

### Task 7: shadcn Sheet primitive

**Files:**
- Modify: `frontend/package.json` (add `@radix-ui/react-dialog`)
- Create: `frontend/src/components/ui/sheet.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils` (existing).
- Produces: `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent` (prop `side?: 'top' | 'right' | 'bottom' | 'left'`, default `'right'`), `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`. Task 8's `CartDrawer` consumes all of these.

No Sheet/Dialog primitive exists in this repo yet (confirmed: only `badge`, `button`, `card`, `input`, `select`, `slider` are in `src/components/ui/`), and none of those existing primitives have their own test file — this one follows that same convention and is exercised indirectly by Task 8's `CartDrawer.test.tsx`.

- [ ] **Step 1: Install the Radix Dialog primitive**

Run:
```bash
cd frontend && npm install @radix-ui/react-dialog
```
Expected: exits 0, adds the package to `frontend/package.json` dependencies.

- [ ] **Step 2: Write the Sheet component**

Create `frontend/src/components/ui/sheet.tsx`:

```tsx
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetPortal = SheetPrimitive.Portal

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-background shadow-lg outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
          side === 'top' &&
            'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
          side === 'bottom' &&
            'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute top-4 right-4 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1.5', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2', className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title data-slot="sheet-title" className={cn('text-base font-semibold', className)} {...props} />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd frontend && npx tsc -b
```
Expected: exits 0, no type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/ui/sheet.tsx
git commit -m "feat(ui): add shadcn Sheet component"
```

---

### Task 8: CartLineRow, CartTrigger, CartDrawer

**Files:**
- Create: `frontend/src/features/cart/components/CartLineRow.tsx`
- Create: `frontend/src/features/cart/components/CartTrigger.tsx`
- Create: `frontend/src/features/cart/components/CartDrawer.tsx`
- Create: `frontend/src/features/cart/components/CartDrawer.test.tsx`

**Interfaces:**
- Consumes: `useCart` (Task 4), `useCartOffers` (Task 6), `Sheet*` components (Task 7), `CartLine`/`VariantOffer` (Task 2), `formatPrice` (`@/lib/formatPrice`, existing), `cn` (`@/lib/utils`, existing).
- Produces: `CartLineRow` (props below), `CartTrigger` (no props — reads `useCart()` itself), `CartDrawer` (no props — reads `useCart()`/`useCartOffers()` itself). Task 9 mounts `CartTrigger` in `AppHeader` and `CartDrawer` in `App.tsx`.

This is the largest task — it's kept as one because the three components and their one test file are only meaningfully testable together (the drawer's four stale-state rows are what Task 8's tests actually exercise).

- [ ] **Step 1: Write `CartLineRow`**

Create `frontend/src/features/cart/components/CartLineRow.tsx`:

```tsx
import { ImageOff, Minus, Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/formatPrice'

import type { CartLine, VariantOffer } from '../schema/types'

export function CartLineRow({
  line,
  offer,
  isLoading,
  onQuantityChange,
  onRemove,
  onAcknowledgePrice,
}: {
  line: CartLine
  offer: VariantOffer | undefined
  isLoading: boolean
  onQuantityChange: (variantId: string, quantity: number) => void
  onRemove: (variantId: string) => void
  onAcknowledgePrice: (variantId: string, price: number) => void
}) {
  if (isLoading) {
    return (
      <div className="flex gap-3 border-b py-4">
        <div className="size-16 shrink-0 animate-pulse rounded-md bg-muted" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (!offer) {
    return (
      <div className="flex items-center gap-3 border-b py-4 opacity-60">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted">
          <ImageOff className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <p className="flex-1 text-sm font-medium">No longer available</p>
        <Button variant="ghost" size="icon" aria-label="Remove from cart" onClick={() => onRemove(line.variantId)}>
          <X className="size-4" />
        </Button>
      </div>
    )
  }

  const outOfStock = offer.stockQty === 0
  const lowStock = !outOfStock && offer.stockQty < line.quantity
  const priceChanged = offer.price !== line.priceWhenAdded
  const lineTotal = offer.price * line.quantity

  return (
    <div className="flex gap-3 border-b py-4">
      <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted">
        {offer.thumbnailUrl ? (
          <img src={offer.thumbnailUrl} alt={offer.productTitle} className="size-full rounded-md object-cover" />
        ) : (
          <ImageOff className="size-6 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <p className="line-clamp-2 text-sm font-medium">{offer.productTitle}</p>
        <p className="text-xs text-muted-foreground">{offer.variantLabel}</p>
        <p className="text-sm">{formatPrice(offer.price)} each</p>

        {outOfStock && <p className="text-xs font-medium text-destructive">Out of stock</p>}
        {lowStock && <p className="text-xs font-medium text-destructive">Only {offer.stockQty} left</p>}
        {priceChanged && (
          <p className="text-xs text-muted-foreground">
            Price updated: was {formatPrice(line.priceWhenAdded)}, now {formatPrice(offer.price)}{' '}
            <button
              type="button"
              className="underline"
              onClick={() => onAcknowledgePrice(line.variantId, offer.price)}
            >
              Dismiss
            </button>
          </p>
        )}

        <div className="mt-1 flex items-center gap-3">
          <div className="flex items-center overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => onQuantityChange(line.variantId, Math.max(1, line.quantity - 1))}
              disabled={outOfStock}
              aria-label="Decrease quantity"
              className="flex h-7 w-7 items-center justify-center text-muted-foreground disabled:opacity-40"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-6 text-center text-sm">{line.quantity}</span>
            <button
              type="button"
              onClick={() => onQuantityChange(line.variantId, Math.min(offer.stockQty, line.quantity + 1))}
              disabled={outOfStock || line.quantity >= offer.stockQty}
              aria-label="Increase quantity"
              className="flex h-7 w-7 items-center justify-center text-muted-foreground disabled:opacity-40"
            >
              <Plus className="size-3" />
            </button>
          </div>
          <span className="text-sm font-semibold">{formatPrice(lineTotal)}</span>
        </div>
      </div>

      <Button variant="ghost" size="icon" aria-label="Remove from cart" onClick={() => onRemove(line.variantId)}>
        <X className="size-4" />
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Write `CartTrigger`**

Create `frontend/src/features/cart/components/CartTrigger.tsx`:

```tsx
import { ShoppingCart } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useCart } from '../context/CartContext'

export function CartTrigger() {
  const { itemCount, open } = useCart()

  return (
    <Button
      variant="outline"
      size="icon"
      className="relative shrink-0"
      aria-label={`Open cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
      onClick={open}
    >
      <ShoppingCart />
      {itemCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </Button>
  )
}
```

- [ ] **Step 3: Write `CartDrawer`**

Create `frontend/src/features/cart/components/CartDrawer.tsx`:

```tsx
import { ShoppingCart } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatPrice } from '@/lib/formatPrice'

import { useCartOffers } from '../api/useCartOffers'
import { useCart } from '../context/CartContext'
import { CartLineRow } from './CartLineRow'

export function CartDrawer() {
  const { lines, isOpen, close, setQuantity, removeLine, acknowledgePrice, clear } = useCart()
  const variantIds = lines.map((line) => line.variantId)
  const query = useCartOffers(variantIds, isOpen)

  const offersById = new Map((query.data ?? []).map((offer) => [offer.id, offer]))
  const total = lines.reduce((sum, line) => {
    const offer = offersById.get(line.variantId)
    return offer ? sum + offer.price * line.quantity : sum
  }, 0)

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between border-b px-5 py-4">
          <SheetTitle>Cart</SheetTitle>
          {lines.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear cart
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5">
          {lines.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ShoppingCart className="size-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">Your cart is empty</p>
              <p className="text-sm text-muted-foreground">Items you add will show up here.</p>
            </div>
          )}

          {query.isError && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load your cart items.</p>
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                Retry
              </Button>
            </div>
          )}

          {lines.map((line) => (
            <CartLineRow
              key={line.variantId}
              line={line}
              offer={offersById.get(line.variantId)}
              isLoading={query.isLoading}
              onQuantityChange={setQuantity}
              onRemove={removeLine}
              onAcknowledgePrice={acknowledgePrice}
            />
          ))}
        </div>

        {lines.length > 0 && (
          <SheetFooter className="border-t px-5 py-4">
            <div className="mb-3 flex w-full items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
            {/* ponytail: no checkout flow exists yet - button is inert */}
            <Button className="w-full rounded-full" size="lg">
              Checkout
            </Button>
            <SheetClose asChild>
              <Button variant="ghost" className="w-full" size="sm">
                Continue shopping
              </Button>
            </SheetClose>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: Write the failing tests**

Create `frontend/src/features/cart/components/CartDrawer.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '../context/CartContext'
import type { CartLine } from '../schema/types'
import { CartDrawer } from './CartDrawer'
import { CartTrigger } from './CartTrigger'

const HEADPHONES_ID = '11111111-1111-1111-1111-111111111111'
const COOKWARE_ID = '33333333-3333-3333-3333-333333333333'
const SHOES_ID = '44444444-4444-4444-4444-444444444444'

function seedCart(lines: CartLine[]) {
  localStorage.setItem('cart:v1', JSON.stringify(lines))
}

function renderDrawer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <CartTrigger />
        <CartDrawer />
      </CartProvider>
    </QueryClientProvider>,
  )
}

async function openDrawer() {
  await userEvent.click(screen.getByRole('button', { name: /Open cart/ }))
}

describe('CartDrawer', () => {
  it('shows the empty state with no lines', async () => {
    seedCart([])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
  })

  it('shows the item count on the trigger badge', async () => {
    seedCart([
      { variantId: `${HEADPHONES_ID}-v1`, quantity: 2, priceWhenAdded: 129.99 },
      { variantId: `${COOKWARE_ID}-v1`, quantity: 1, priceWhenAdded: 74.5 },
    ])
    renderDrawer()
    expect(await screen.findByText('3')).toBeInTheDocument()
  })

  it('renders a line with the live title, variant, and unit price', async () => {
    seedCart([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 }])
    renderDrawer()
    await openDrawer()

    expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument()
    expect(screen.getByText('Black')).toBeInTheDocument()
    expect(screen.getByText('$129.99 each')).toBeInTheDocument()
  })

  it('sums the total across lines using live prices', async () => {
    seedCart([
      { variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 },
      { variantId: `${COOKWARE_ID}-v1`, quantity: 1, priceWhenAdded: 74.5 },
    ])
    renderDrawer()
    await openDrawer()
    await screen.findByText('Wireless Noise-Cancelling Headphones')
    expect(screen.getByText('$204.49')).toBeInTheDocument()
  })

  it('shows "No longer available" for an offer that no longer exists', async () => {
    seedCart([{ variantId: 'ghost-variant', quantity: 1, priceWhenAdded: 10 }])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('No longer available')).toBeInTheDocument()
  })

  it('marks a line out of stock', async () => {
    seedCart([{ variantId: `${SHOES_ID}-v1`, quantity: 1, priceWhenAdded: 64 }])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('Out of stock')).toBeInTheDocument()
  })

  it('caps quantity and warns when stock is below cart quantity', async () => {
    seedCart([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 10, priceWhenAdded: 129.99 }])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('Only 8 left')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled()
  })

  it('shows a price-change notice and can dismiss it', async () => {
    seedCart([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 99.99 }])
    renderDrawer()
    await openDrawer()

    expect(await screen.findByText(/Price updated: was \$99\.99, now \$129\.99/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByText(/Price updated/)).not.toBeInTheDocument())
  })

  it('removes a line', async () => {
    seedCart([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 }])
    renderDrawer()
    await openDrawer()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    await userEvent.click(screen.getByRole('button', { name: 'Remove from cart' }))
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
  })

  it('clears all lines', async () => {
    seedCart([
      { variantId: `${HEADPHONES_ID}-v1`, quantity: 1, priceWhenAdded: 129.99 },
      { variantId: `${COOKWARE_ID}-v1`, quantity: 1, priceWhenAdded: 74.5 },
    ])
    renderDrawer()
    await openDrawer()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    await userEvent.click(screen.getByRole('button', { name: 'Clear cart' }))
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    seedCart([])
    renderDrawer()
    await openDrawer()
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument())
  })

  it('traps focus inside the drawer while open', async () => {
    seedCart([])
    renderDrawer()
    await openDrawer()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/cart/components/CartDrawer.test.tsx`
Expected: FAIL — components don't exist yet.

- [ ] **Step 6: Run the tests to verify they pass**

(The implementation was already written in Steps 1-3.)

Run: `cd frontend && npx vitest run src/features/cart/components/CartDrawer.test.tsx`
Expected: PASS (12 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/cart/components/
git commit -m "feat(cart): add CartLineRow, CartTrigger, and CartDrawer"
```

---

### Task 9: Wire the cart into the app shell

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/AppHeader.tsx`

**Interfaces:**
- Consumes: `CartProvider` (Task 4), `CartDrawer` (Task 8), `CartTrigger` (Task 8).
- Produces: nothing new — this is pure wiring, verified by Task 10/11's page tests rendering through `AppHeader` (which now unconditionally renders `CartTrigger`, so any broken wiring fails those tests immediately).

- [ ] **Step 1: Wrap the router in `CartProvider` and mount `CartDrawer` once**

Modify `frontend/src/App.tsx` to the following full contents:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'

import { CartDrawer } from '@/features/cart/components/CartDrawer'
import { CartProvider } from '@/features/cart/context/CartContext'
import { router } from '@/router'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <RouterProvider router={router} />
        <CartDrawer />
      </CartProvider>
    </QueryClientProvider>
  )
}

export default App
```

- [ ] **Step 2: Add the cart trigger to the shared header**

Modify `frontend/src/components/layout/AppHeader.tsx`. Add the import:

```ts
import { CartTrigger } from '@/features/cart/components/CartTrigger'
```

Then add `<CartTrigger />` right after the closing `</form>` tag, inside the header's flex row (so it sits at the end of `<div className="mx-auto flex max-w-[1320px] items-center gap-7 px-7 py-3">`, after the search `<form>...</form>` block, before that div's closing tag):

```tsx
        <CartTrigger />
      </div>
    </header>
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd frontend && npx tsc -b
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/AppHeader.tsx
git commit -m "feat(cart): wire CartProvider and CartDrawer into the app shell"
```

---

### Task 10: Wire add-to-cart on the product detail page

**Files:**
- Modify: `frontend/src/features/catalog/api/useAddToCart.ts`
- Modify: `frontend/src/pages/ProductDetail.tsx`
- Modify: `frontend/src/pages/ProductDetail.test.tsx`

**Interfaces:**
- Consumes: `useCart` (Task 4).
- Produces: `useAddToCart()` now returns `{ addToCart(variantId: string, quantity: number, price: number): void; isPending: false }` (signature grows from 2 args to 3 — the one call site is updated in the same task).

- [ ] **Step 1: Replace the stub with a real call into the cart**

Replace the full contents of `frontend/src/features/catalog/api/useAddToCart.ts`:

```ts
import { useCart } from '@/features/cart/context/CartContext'

export function useAddToCart() {
  const { addLine } = useCart()

  function addToCart(variantId: string, quantity: number, price: number) {
    addLine(variantId, quantity, price)
  }

  return { addToCart, isPending: false }
}
```

- [ ] **Step 2: Pass the price at the one call site**

In `frontend/src/pages/ProductDetail.tsx`, find this block (around line 83-90):

```tsx
              <BuyBox
                price={selectedVariant.price}
                stockQty={selectedVariant.stockQty}
                quantity={quantity}
                onQuantityChange={setQuantity}
                isAdding={isPending}
                onAddToCart={() => addToCart(selectedVariant.id, quantity)}
              />
```

Change the last prop to pass price as the third argument:

```tsx
              <BuyBox
                price={selectedVariant.price}
                stockQty={selectedVariant.stockQty}
                quantity={quantity}
                onQuantityChange={setQuantity}
                isAdding={isPending}
                onAddToCart={() => addToCart(selectedVariant.id, quantity, selectedVariant.price)}
              />
```

- [ ] **Step 3: Update the test — wrap with CartProvider and assert real cart state**

`ProductDetail.tsx` now calls `useCart()` (via `useAddToCart`) on every render, so every test in this file needs a `CartProvider` ancestor or it throws immediately. Replace the full contents of `frontend/src/pages/ProductDetail.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'

import { ProductDetail } from './ProductDetail'

function renderPage(productId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={[`/products/${productId}`]}>
          <Routes>
            <Route path="/products/:productId" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

const HEADPHONES_ID = '11111111-1111-1111-1111-111111111111'
const COOKWARE_ID = '33333333-3333-3333-3333-333333333333'

describe('ProductDetail', () => {
  it('renders product info and defaults to the Details tab', async () => {
    renderPage(HEADPHONES_ID)

    expect(await screen.findByRole('heading', { name: /Wireless Noise-Cancelling Headphones/ })).toBeInTheDocument()
    expect(screen.getByText(/over-ear headphones/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Details/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the not-found error state for an unknown product', async () => {
    renderPage('does-not-exist')
    expect(await screen.findByText("Couldn't load this product")).toBeInTheDocument()
  })

  it('switches price when a different variant is selected', async () => {
    renderPage(HEADPHONES_ID)
    await screen.findByRole('heading', { name: /Wireless/ })

    // price and subtotal both read $129.99 at qty 1 - two matches, both correct
    expect(screen.getAllByText('$129.99').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'White' }))
    expect(screen.getAllByText('$139.99').length).toBeGreaterThan(0)
    expect(screen.queryByText('$129.99')).not.toBeInTheDocument()
  })

  it('switches to the Reviews tab and lists reviews', async () => {
    renderPage(HEADPHONES_ID)
    await screen.findByRole('heading', { name: /Wireless/ })

    await userEvent.click(screen.getByRole('tab', { name: /Reviews/ }))
    expect(await screen.findByText('Jordan K.')).toBeInTheDocument()
  })

  it('shows no reviews for a product with none', async () => {
    renderPage(COOKWARE_ID)
    await screen.findByRole('heading', { name: /Cookware/ })

    await userEvent.click(screen.getByRole('tab', { name: /Reviews/ }))
    expect(await screen.findByText('No reviews yet.')).toBeInTheDocument()
  })

  it('adds the selected variant and quantity to the cart', async () => {
    renderPage(HEADPHONES_ID)
    await screen.findByRole('heading', { name: /Wireless/ })

    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

    const stored = JSON.parse(localStorage.getItem('cart:v1') ?? '[]')
    expect(stored).toEqual([{ variantId: `${HEADPHONES_ID}-v1`, quantity: 2, priceWhenAdded: 129.99 }])
  })
})
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/pages/ProductDetail.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/catalog/api/useAddToCart.ts frontend/src/pages/ProductDetail.tsx frontend/src/pages/ProductDetail.test.tsx
git commit -m "feat(cart): wire add-to-cart on the product detail page"
```

---

### Task 11: Wire add-to-cart on the product card

**Files:**
- Create: `frontend/src/features/cart/api/useAddToCartFromProduct.ts`
- Modify: `frontend/src/features/search/components/ProductCard.tsx`
- Modify: `frontend/src/pages/SearchResults.test.tsx`

**Interfaces:**
- Consumes: `useCart` (Task 4), `apiClient` (`@/lib/api/client`, existing).
- Produces: `useAddToCartFromProduct()` returning `{ addDefaultVariant(productId: string): Promise<void>; isPending: boolean }`.

`ProductSummary` (what `ProductCard` receives) carries no variant id — search results are product-level. This hook fetches the one product's detail on click and adds its first in-stock variant (falling back to the first variant if none are in stock), mirroring `ProductDetail.tsx`'s own default-variant selection.

- [ ] **Step 1: Write the hook**

Create `frontend/src/features/cart/api/useAddToCartFromProduct.ts`:

```ts
import { useState } from 'react'

import { apiClient } from '@/lib/api/client'

import { useCart } from '../context/CartContext'

export function useAddToCartFromProduct() {
  const { addLine, open } = useCart()
  const [isPending, setIsPending] = useState(false)

  async function addDefaultVariant(productId: string) {
    setIsPending(true)
    try {
      const { data, error } = await apiClient.GET('/products/{productId}', {
        params: { path: { productId } },
      })
      if (error || !data) return
      const variant = data.variants.find((v) => v.stockQty > 0) ?? data.variants[0]
      if (!variant) return
      addLine(variant.id, 1, variant.price)
      open()
    } finally {
      setIsPending(false)
    }
  }

  return { addDefaultVariant, isPending }
}
```

- [ ] **Step 2: Wire it into `ProductCard`**

Replace the full contents of `frontend/src/features/search/components/ProductCard.tsx`:

```tsx
import { ImageOff, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router'

import { RatingBadge } from '@/components/RatingBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAddToCartFromProduct } from '@/features/cart/api/useAddToCartFromProduct'
import { formatPrice } from '@/lib/formatPrice'

import type { ProductSummary } from '../schema/types'

export function ProductCard({ product }: { product: ProductSummary }) {
  const { addDefaultVariant, isPending } = useAddToCartFromProduct()

  return (
    <Card className="h-full gap-3 overflow-hidden py-0">
      <Link to={`/products/${product.id}`} className="flex aspect-square items-center justify-center bg-muted">
        {product.thumbnailUrl ? (
          <img
            src={product.thumbnailUrl}
            alt={product.title}
            className="size-full object-cover"
          />
        ) : (
          <ImageOff className="size-8 text-muted-foreground" aria-hidden />
        )}
      </Link>
      <CardContent className="flex flex-1 flex-col gap-1.5 px-3 pb-3">
        <p className="text-base font-semibold">{formatPrice(product.priceFrom)}</p>
        <Link to={`/products/${product.id}`} className="line-clamp-2 text-sm leading-snug hover:underline">
          {product.title}
        </Link>
        {/* mt-auto anchors this row to the card's bottom edge regardless of
            whether the title above wrapped to one line or the full two -
            cards in the same grid row are already equal height via CSS
            grid's default align-items: stretch. */}
        <div className="mt-auto flex items-center gap-2">
          {product.avgRating != null && <RatingBadge rating={product.avgRating} />}
          <Button
            size="icon"
            className="ml-auto"
            disabled={!product.inStock || isPending}
            aria-label={product.inStock ? 'Add to cart' : 'Out of stock'}
            onClick={() => addDefaultVariant(product.id)}
          >
            <ShoppingCart />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Update `SearchResults.test.tsx` — wrap with CartProvider, add the card flow test**

`ProductCard` now calls `useCart()` unconditionally, so every existing test needs a `CartProvider` ancestor. Replace the full contents of `frontend/src/pages/SearchResults.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { server } from '@/test/msw/server'

import { SearchResults } from './SearchResults'

function renderPage(initialEntry = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <SearchResults />
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

describe('SearchResults', () => {
  it('shows a loading skeleton then the seeded products', async () => {
    renderPage()
    expect(
      await screen.findByText('Wireless Noise-Cancelling Headphones'),
    ).toBeInTheDocument()
    expect(screen.getByText('6 products')).toBeInTheDocument()
  })

  it('shows the query in the results header once searched', async () => {
    renderPage('/?q=laptop')
    expect(await screen.findByText('14" Ultrabook Laptop, 16GB RAM')).toBeInTheDocument()
    expect(screen.getByText(/results for/)).toBeInTheDocument()
    expect(
      screen.queryByText('Wireless Noise-Cancelling Headphones'),
    ).not.toBeInTheDocument()
  })

  it('shows the no-results state for a query that matches nothing', async () => {
    renderPage('/?q=doesnotexist')
    expect(await screen.findByText('No products found')).toBeInTheDocument()
  })

  it('shows the error state and can retry', async () => {
    server.use(
      http.get(
        'http://localhost:8080/products',
        () =>
          HttpResponse.json(
            { type: 'about:blank', title: 'Internal error', status: 500 },
            { status: 500 },
          ),
        { once: true },
      ),
    )
    renderPage()
    expect(await screen.findByText("Couldn't load products")).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByText('Wireless Noise-Cancelling Headphones'),
    ).toBeInTheDocument()
  })

  it('filters to in-stock only', async () => {
    renderPage()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    await userEvent.click(screen.getByLabelText('In stock only'))

    await waitFor(() =>
      expect(screen.queryByText('Trail Running Shoes')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByLabelText('Remove In stock only filter'),
    ).toBeInTheDocument()
  })

  it('adds the default variant to the cart from the product card', async () => {
    renderPage()
    await screen.findByText('Wireless Noise-Cancelling Headphones')

    const [firstCardButton] = screen.getAllByRole('button', { name: 'Add to cart' })
    await userEvent.click(firstCardButton)

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('cart:v1') ?? '[]')
      expect(stored).toEqual([
        { variantId: '11111111-1111-1111-1111-111111111111-v1', quantity: 1, priceWhenAdded: 129.99 },
      ])
    })
  })
})
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/pages/SearchResults.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/cart/api/useAddToCartFromProduct.ts frontend/src/features/search/components/ProductCard.tsx frontend/src/pages/SearchResults.test.tsx
git commit -m "feat(cart): wire add-to-cart on the product card"
```

---

### Task 12: Full verification — tests, types, lint, build, manual browser check

**Files:** none (verification only).

**Interfaces:** none — this task consumes the whole feature and produces no new code.

- [ ] **Step 1: Run the full test suite**

Run:
```bash
cd frontend && npm test
```
Expected: all test files pass, including the two page test files and all new `features/cart/**` test files.

- [ ] **Step 2: Type-check and build**

Run:
```bash
cd frontend && npm run build
```
Expected: exits 0 (`tsc -b && vite build`).

- [ ] **Step 3: Lint**

Run:
```bash
cd frontend && npm run lint
```
Expected: exits 0.

- [ ] **Step 4: Manual browser check — desktop**

Start the dev server with MSW enabled and open it in the browser (use the `run` skill or the Browser tool's `preview_start` against the Vite dev server with `VITE_USE_MSW=true`). Verify:
1. Search results page: click a product card's cart icon — badge appears on the header cart icon, drawer opens showing the product.
2. Click the header cart icon again — drawer opens/closes.
3. Open a product detail page, change variant and quantity, click "Add to cart" — drawer opens, quantity/price match what was selected; add the same variant again — quantity increments in the same line rather than duplicating.
4. In the drawer: change a line's quantity, remove a line, clear down to empty and confirm the empty state renders.
5. Press Escape while the drawer is open — it closes. Click outside the drawer — it closes.

- [ ] **Step 5: Manual browser check — mobile width**

Using the Browser tool's `resize_window` with the `mobile` preset (or an equivalent ~375px-wide viewport), reload, open the drawer, and confirm it renders full-width (or very close to it) rather than the desktop `sm:max-w-md` panel, and that all line controls remain usable at that width. Reset the viewport to `desktop` afterward.

- [ ] **Step 6: Final commit if any fixups were needed**

If Steps 1-5 required any code changes, commit them with a message describing what was fixed. If nothing needed fixing, this task ends with no commit (verification-only).

---

## Explicitly out of scope (flagged, not built here)

- The backend `/variants` controller — see Task 1; the frontend contract is fully defined and typed, but no Spring implementation exists. Until it does, the drawer will show its error/retry state against a real (non-MSW) backend.
- Checkout flow — the drawer's "Checkout" button is intentionally inert (see Task 8, Step 3).
- Any server-side cart or order persistence.
