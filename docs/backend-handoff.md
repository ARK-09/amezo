# Backend handoff — screens designed 2026-09-26

The frontend for these screens is written against the contract below. Every path
is in `frontend/openapi/fixture.yaml`, which is what generates the TypeScript
client, so the shapes here and the ones the UI compiles against cannot drift.

Nothing in this round is implemented server-side yet. Until it is, the screens
call the real endpoints and surface the ordinary `ProblemDetail` error; the
mock handlers that make them work locally are behind `VITE_USE_MSW` and never
run in production.

## Versioning

Everything new is under `/api/v1`. The existing endpoints (`/products`,
`/orders`, `/sellers/me/...`) are still unversioned and are left alone so the
shipped app keeps working.

**Requested:** serve the existing paths under `/api/v1` as well, keeping the
unprefixed ones as aliases for one deprecation window. The frontend then flips a
single `baseUrl` and the alias can be dropped. No new unversioned endpoint
should be added.

## New endpoints

### Buyer orders
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/orders` | `status`, `group` (`all\|in_progress\|delivered\|refunds`), `q`, `from`, `to`, `page`, `size`. Buyer session. One row per seller order. |
| GET | `/api/v1/orders/{orderId}` | `404` (not `403`) when it exists but is not the caller's, so order ids are not confirmed to strangers. |

### Refunds
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/refund-requests` | Buyer's own. `status`, `page`, `size`. |
| POST | `/api/v1/refund-requests` | Buyer session. `409` if a line already has an open request, `422` past the return window. |
| GET | `/api/v1/refund-requests/{id}` | Readable by the buyer who raised it and the seller who owes it. Anyone else `404`. |
| PATCH | `/api/v1/refund-requests/{id}` | The state machine. Illegal transition `409`. |
| GET | `/api/v1/sellers/me/refund-requests` | Seller queue. `status`, `q`, `page`, `size`. |

### Store profile
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/sellers/me/store` | |
| PATCH | `/api/v1/sellers/me/store` | Partial. `409 handle-taken`, checked before the unique index so the seller learns which field collided. |
| GET | `/api/v1/stores/{handle}` | Public. Replaces deriving a storefront from `brandName`. |

### Seller catalog and orders
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/sellers/me/products` | `q`, `status`, `categorySlug`, `stockBelow`, `sort`, `page`, `size`. Supersedes the unversioned one, which takes no parameters and caps at 100. |
| GET | `/api/v1/sellers/me/orders` | `q`, `status`, `sort`, `page`, `size`. |
| GET | `/api/v1/sellers/me/orders/{orderId}` | |
| PATCH | `/api/v1/sellers/me/orders/{orderId}` | **Replaces `POST /sellers/me/orders/{id}/ship`**, which put the verb in the path. Body carries `parcels`/`packedBy` for PACKED and `handoverMethod`/`hub` for SHIPPED. `trackingNumber` is **not** writable — the design says it is issued by the platform on handover. |
| PATCH | `/products/{productRef}` | Accept `status` (`ACTIVE\|DRAFT`) on the existing endpoint, for publishing and unpublishing a listing. `ARCHIVED` is the soft delete `DELETE /products/{productRef}` performs, so it is not writable here. |
| POST | `/products` | Accept an optional `status` (`ACTIVE\|DRAFT`) so a listing can be staged before it goes live. Omitted means `ACTIVE`. |
| GET | `/products/{productRef}` (seller view) | Return `status` on `SellerProductDetail`. It is writable on PATCH but was absent from the detail the edit form reads back, so the form had no way to show which state the listing is in. |

### Metrics
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/sellers/me/metrics` | `from`, `to`, `interval`. Returns totals, the daily series, **and** the preceding equal-length window's totals so the UI shows deltas without a second call. |
| GET | `/api/v1/sellers/me/metrics/top-products` | `from`, `to`, `limit`. |
| GET | `/api/v1/sellers/me/metrics/category-breakdown` | `from`, `to`. |

The dashboard's four queue widgets need no endpoints of their own — they are
`?status=PLACED&size=5`, `?stockBelow=10&size=5`, `?sort=newest&size=5` and
`?status=REQUESTED&size=5` against the lists above.

## Schema changes

**New: `store_profile`** — one per seller. `id`, `seller_id` (unique FK),
`name`, `handle` (**unique, indexed** — public URL key), `tagline`, `location`,
`founded_year`, `support_email`, `about`, `cover_url`, `logo_url`,
`status` (`OPEN|VACATION|CLOSED`), `vacation_note`, `updated_at`.

**New: `refund_request`** — `id`, `reference`, `order_id` FK, `buyer_id`,
`seller_id`, `status`, `resolution` (`REFUND|REPLACEMENT`), `payout`
(`ORIGINAL_PAYMENT|ALTERNATE_METHOD`), `detail`, `requested_amount`,
`approved_amount`, `currency`, `decline_reason`, `return_tracking_number`, and
timestamps `requested_at`, `approved_at`, `declined_at`, `return_received_at`,
`refunded_at`, `replacement_sent_at`.

**New: `refund_request_line`** — `id`, `refund_request_id` FK, `order_line_id`
FK, `quantity`. Partial-unique index on `order_line_id` where the parent
request is open, which is what makes the duplicate-request `409` enforceable
rather than a race.

**Derived on the order lists** — `GET /api/v1/orders` returns
`openRefundRequestId` and `openRefundStatus` per row, and
`GET /api/v1/sellers/me/orders` returns `hasOpenRefund`. All three read the
buyer's/seller's open `refund_request` for that order; "open" is any status
outside the terminal set (`REFUNDED`, `REPLACEMENT_SENT`, `DECLINED`,
`CANCELLED`). The card prints a badge for the status, so the id alone is not
enough — a refund nobody has looked at yet must not read the same as an
approved one.

**Changed: `order.status`** — `PLACED, SHIPPED, DELIVERED` becomes
`PLACED, PACKED, SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, CANCELLED`.
Existing rows map unchanged.

**Changed: `order`** — add `reference` (short human id the screens print; the
uuid stays the key), `packed_at`, `parcels`, `carrier`, `tracking_url`,
`estimated_delivery_at`, `delivered_at`, `delivery_note`, and `tax`/`shipping`
if they are not already persisted — the buyer's order detail itemises both.

**New: `order_event`** — `id`, `order_id` FK, `code`, `at`, `detail`. The
buyer's tracking timeline is a read of this, not a derivation from timestamps
spread across the order row.

**Changed: `product`** — add `status` (`ACTIVE|DRAFT|ARCHIVED`, default
`ACTIVE`) and `updated_at`.

**New: product view tracking** — the dashboard charts views and conversion
rate. Nothing records an impression today. Minimum viable shape is a
`product_view` append table (`product_id`, `seller_id`, `viewed_at`, a
visitor hash for dedupe) plus a daily rollup the metrics endpoints read;
serving the charts off the raw table will not hold.

## State transitions

The unversioned seller endpoints previously declared their own inline
`[PLACED, SHIPPED, DELIVERED]`. They describe the same column, so they now
reference the shared `OrderStatus` too.

**Order** — `PLACED → PACKED → SHIPPED → IN_TRANSIT → OUT_FOR_DELIVERY →
DELIVERED`. Seller may drive `PLACED→PACKED` (takes `parcels`, `packedBy`) and
`PLACED|PACKED→SHIPPED` (takes `handoverMethod`, `hub`). Either may carry a
`note`, which is shown to the buyer on the order timeline. The seller never
supplies `trackingNumber`: the platform issues it on handover and returns it on
the next read. The three carrier states are system-driven and not writable by a
seller. `CANCELLED` only from `PLACED`. Anything else `409`.

**Refund** — `REQUESTED → APPROVED → AWAITING_RETURN → RETURN_RECEIVED →
REFUNDED`, with `REQUESTED → DECLINED`, `APPROVED → REPLACEMENT_SENT` when the
resolution is `REPLACEMENT`, and `REQUESTED → CANCELLED` by the buyer only.
Terminal: `REFUNDED`, `REPLACEMENT_SENT`, `DECLINED`, `CANCELLED`.

## Validation and auth

- Every endpoint above needs a session. Buyer routes reject a seller cookie and
  vice versa; `/api/v1/stores/{handle}` is the only public one.
- `POST /api/v1/refund-requests`: at least one line; each line must belong to an
  order owned by the caller; `quantity` ≤ the line's ordered quantity minus what
  is already under request; `detail` ≥ 20 characters; `payout` required when
  `resolution` is `REFUND`. The 20-character floor is enforced in the UI too, but
  the server owns it.
- `PATCH /api/v1/refund-requests/{id}`: only the owning seller may approve,
  decline, receive, refund or send a replacement. `approvedAmount` must be
  ≤ `requested_amount`. `declineReason` required on `DECLINED`.
- `PATCH /api/v1/sellers/me/store`: `handle` matches the shared `StoreHandle`
  schema — `^[a-z0-9][a-z0-9-]{0,37}[a-z0-9]$`, 2–39 characters, no dash at either
  end so the public URL never ends in one. Compared case-insensitively, unique, and
  **immutable once orders exist** unless you also plan redirects from the old public
  URL. The client normalises to this shape before sending, but the server owns it.
- `canRequestRefund` and `refundWindowEndsAt` on the order detail are
  server-owned. No screen re-derives the return window from dates.

## Migrations

1. `store_profile` + backfill one row per existing seller, `handle` slugified
   from the current `brandName` with a numeric suffix on collision. Storefront
   URLs move from `/stores/:brand` to `/stores/:handle` — keep the old route
   resolving by brand for one release.
2. `order.status` enum widening. Additive; no existing row changes value.
3. `order` column additions + `reference` backfill.
4. `order_event` + backfill from existing `placed_at`/`shipped_at` so old orders
   still render a timeline.
5. `product.status` default `ACTIVE` + `updated_at`.
6. `refund_request`, `refund_request_line`.
7. `product_view` + rollup.

## Other backend work

- **Payments.** Refunds assume money can be sent back, and the buyer's order
  detail shows a card brand and last four. Checkout currently takes no payment
  and stores no method. `payment` is optional in the contract and the UI omits
  the row when it is absent — but `REFUNDED` is not truthful until a provider is
  wired.
- **Tax and shipping.** Both are itemised on the buyer's order. Confirm they are
  persisted per order rather than recomputed.
- **`reference` format.** The designs show `ord_19ff4c82` / `ref_4d90b12c`.
  Anything stable and short works; the frontend only prints it.
- **Replacement orders.** `REPLACEMENT_SENT` implies a replacement shipment. The
  design does not say whether that is a new order or a reshipment of the
  original, and the contract deliberately does not guess. Needs a decision.
- **Seller-initiated refunds.** The order panel in the designs has a "Refunded"
  stage in its compose box, which would let a seller refund an order without the
  buyer raising anything. The refund resource is buyer-raised today, so that
  stage is not built. If it is wanted, it needs either
  `POST /api/v1/sellers/me/refund-requests` or a flag on the existing create
  endpoint, plus a rule for who may raise one against whom.
- **Handover hubs.** `hub` is a free string in the contract because the design
  lists three fixed warehouses with no source. If hubs are real entities they
  want `GET /api/v1/hubs` and an id rather than a label.
- **Category conflict.** The seller product designs use free-text categories
  (`Headphones`, `Earbuds`, `Speakers`); the app moved to system categories with
  slugs. The contract uses the system `Category`. The designs' labels are not
  achievable without adding those categories or allowing seller-defined ones.
