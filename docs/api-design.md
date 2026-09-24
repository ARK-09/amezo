# API design (MVP)

Spec only — no code. Built on top of `docs/adr/0001-mvp-scope-and-data-model.md`'s plain single-seller-per-product model. Spring is the source of truth: springdoc generates the OpenAPI spec from the running Spring app, openapi-typescript turns that into frontend TS types. Every shape below is chosen to express cleanly through that pipeline (Spring Data `Page<T>` used as-is, `ProblemDetail` used as-is, no hand-rolled envelopes where a Spring-native one already exists).

REST conventions followed throughout: plural nouns for collections, HTTP verbs carry the semantics, no verbs in paths, standard status codes, nesting only where ownership is real (see the reviews section for a case where nesting was deliberately *not* used, and the image-confirm section for a case with no standard REST shape at all).

## Decisions the API design forced onto the data model

These weren't visible until the endpoints were actually laid out. None of them require touching what's already in ADR 0001; they're additions.

1. **Checkout must split a multi-seller cart into one `order` per seller.** The ADR's `order` has a single `status`/`tracking_number`/`shipped_at` — only coherent if one seller ships it. Nothing stops a cart from holding variants from two different sellers even under single-seller-per-*product*. `POST /orders` groups lines by seller and creates N `order` rows atomically (all-or-nothing across every seller, not just within one). This is what real multi-seller marketplaces do — one checkout, multiple orders when sellers differ.
2. **A `session` entity is needed for magic-link consumption.** Not in the original ADR. `session(id, identity_type: buyer|seller, identity_id, token_hash, expires_at, created_at)`.
3. **An `order_address` entity is needed once checkout collects phone/shipping/billing.** Not in the original ADR (added when the scope grew to include it). See the checkout section.

## Error model — one shape, everywhere

Spring Boot 3's native `ProblemDetail` (RFC 7807), not a hand-rolled shape — it's already idiomatic for the pipeline and springdoc renders it as one reusable OpenAPI component referenced by every operation's error responses.

```
{
  "type": "https://api/errors/out-of-stock",   // stable machine code, URI form per RFC 7807
  "title": "Out of stock",
  "status": 409,
  "detail": "2 lines are no longer available in the requested quantity",
  "errors": [                                   // extension member, only on validation/conflict
    { "field": "lines[1].variantId", "reason": "requested 3, available 1" }
  ]
}
```

Every 4xx/5xx from every endpoint below returns this. `errors[]` is omitted when there's nothing itemized (e.g. plain `404`, `401`).

## Auth — magic link, end to end

| Step | Method & path | Auth | Notes |
|---|---|---|---|
| Request link | `POST /magic-links` | none | Body: `{ email, role: "buyer"\|"seller" }`. Always `202 Accepted`, never reveals whether the email/account exists. Creates `magic_link_token` (hash stored, 15 min TTL), emails the raw token in a link. |
| Consume | `POST /sessions` | none | Body: `{ token }`. **POST, not GET** — the emailed link opens a static confirmation page with a button; the button fires this call. Reason: corporate mail scanners pre-fetch GET links and burn single-use tokens before the real user clicks. Marks `magic_link_token.consumed_at`, creates `session`, sets an httpOnly/Secure/SameSite=Lax cookie. `201` with body `{ identityType, identityId, email, fullName, expiresAt }`. `410 Gone` if the token is expired or already consumed. |
| Check session | `GET /sessions/current` | cookie | `200` with the same identity body, or `401`. This is also how the frontend gets "logged in as X" without a separate `/buyers/me`. |
| Logout | `DELETE /sessions/current` | cookie | `204`. Deletes the `session` row server-side (revocable, not just cookie-clearing). |

Session cookie TTL: 30 days, no refresh/rotation for MVP. Buyer sessions and seller sessions are the same mechanism (`identity_type` distinguishes them) — no separate seller auth endpoints needed.

## Products & search

`GET /products`

| Param | Combines or exclusive |
|---|---|
| `q` (string) | combines (AND) with everything below |
| `category` (string, exact) | combines |
| `priceMin`, `priceMax` (numeric) | combine; matches if **any** variant's price falls in range |
| `inStockOnly` (bool) | combines; true = at least one variant has `stockQty > 0` |
| `sort` = `relevance`\|`price_asc`\|`price_desc`\|`newest` | **exclusive**, single value. `relevance` with empty `q` silently falls back to `newest`, not an error |
| `page`, `size` | standard Spring Data pagination |

Response: Spring Data's native `Page<T>` shape used as-is (`content`, `page`, `totalElements`, `totalPages`) — no custom envelope invented.

```
ProductSummary: { id, title, brandName, category, priceFrom, thumbnailUrl, avgRating, inStock }
```

`GET /products/{productId}` — full detail, `200`/`404`. Flattening rule applies here:

```
{
  id, title, brandName, description, category, sellerId, sellerName,
  images: [ { id, url, position } ],           // product-level fallback images
  variants: [
    { id, label, sku, price, stockQty,          // <- offer fields flattened onto variant
      images: [ { id, url, position } ] }
  ],
  reviewSummary: { averageRating, count }
}
```

Schema keeps `offer` separate from `variant`; the DTO/projection layer joins them into one object. Same flattening applies to every variant-bearing response below (seller's own list, checkout confirmation, order lines).

`GET /products/{productId}/reviews` — public, paginated, `Page<Review>` where `Review: { id, rating, body, variantLabel, createdAt, reviewerFirstName }`.

`GET /variants?ids=...` — **proposed, not yet implemented.** Added by the cart-drawer frontend work as the batch-fetch contract a cart drawer needs (one call to re-price/re-check every line by variant id on open), not by any backend change. `ids` is a comma-separated list of variant ids; the response is a flat array of the same offer-flattened-onto-variant shape as `variants[]` above (`{ id, productId, productTitle, variantLabel, thumbnailUrl, price, stockQty }`); ids that don't exist are simply omitted from the response rather than erroring. No Spring controller implements this yet — see `frontend/openapi/fixture.yaml` for the placeholder contract the frontend codegens against in the meantime. Relatedly, despite being documented above, `GET /products/{productId}` itself is also not yet implemented in the backend: only `GET /products` with `q` is currently wired end-to-end (see `ProductController.java`), so the flattening example above doesn't reflect working code today.

## Images — presigned upload + confirm

No standard REST shape for "get me a place to PUT a file, then tell the server it arrived." Resolution uses the resource's own state field rather than a verb in the path:

1. `POST /products/{productId}/images` or `POST /variants/{variantId}/images` — auth: owning seller. Body: `{ contentType, fileSizeBytes }`. Creates an `image` row with `status: pending`, returns:
   ```
   201 { id, status: "pending", uploadUrl, uploadFields, expiresAt }
   ```
   `uploadFields` = presigned POST conditions (content-length-range, content-type) — presigned POST, not PUT, because PUT can't enforce a size range.
2. Client uploads the file directly to S3 with those fields.
3. `PATCH /images/{imageId}` — auth: owning seller. Empty body. Server does an S3 HEAD; if the object exists, sets `status: stored`; if not, `409` with `type: upload-not-found`. Returns the current image resource either way.

An unused presigned URL just leaves an `image` row stuck at `pending` forever — cheap to ignore or garbage-collect later, and it never displays (only `stored` images render on the product page). No verb anywhere in the path; the transition is the resource's own status field.

## Checkout — the atomic call

`POST /orders` — auth: none (guest).

```
Request: {
  buyerEmail, buyerFullName, buyerPhone,
  shippingAddress: { line1, line2?, city, state?, postalCode, country },
  billingSameAsShipping: boolean,
  billingAddress?: { line1, line2?, city, state?, postalCode, country },
  lines: [ { variantId, quantity, expectedUnitPrice? } ]
}
```

**Billing is a flag, not two mandatory forms.** `billingSameAsShipping: boolean`; `billingAddress` is required only when it's `false`. If `true`, any `billingAddress` sent anyway is silently ignored server-side (not a validation error — don't punish a frontend that always submits both fields for form-state simplicity).

**Validation:**

| Field | Required | Rule |
|---|---|---|
| `buyerEmail` | yes | valid email format |
| `buyerFullName` | yes | non-empty |
| `buyerPhone` | yes | E.164 (`^\+[1-9]\d{1,14}$`). No per-country format tables, no carrier lookup — shape-check only. Frontend collects country + local number and composes E.164; backend only ever sees the composed form. |
| `shippingAddress.line1` | yes | non-empty |
| `shippingAddress.line2` | no | — |
| `shippingAddress.city` | yes | non-empty |
| `shippingAddress.state` | **no** | freeform, unvalidated. Not every country has states/provinces; conditionally requiring it per-country is a rabbit hole with no MVP payoff. |
| `shippingAddress.postalCode` | yes | non-empty only. Format varies too much cross-country to enforce a pattern without a country-specific rule table — deliberately not building one. |
| `shippingAddress.country` | yes | must match a maintained ISO 3166-1 alpha-2 allow-list (`US`, `CA`, `GB`, …), not freeform text. |
| `billingAddress.*` | same rules as shipping | only enforced when `billingSameAsShipping` is `false` |

All failures are one `422` with the shared error shape, `errors[]` itemized per field.

**Snapshot, not a live address book.** New entity:

```
order_address(id, order_id, type: shipping|billing,
              full_name, phone, line1, line2, city, state, postal_code, country)
```

Always exactly **two** rows per order — shipping and billing — even when identical (`billingSameAsShipping: true` copies shipping's values into the billing row at write time). Simpler than conditionally omitting the billing row: every downstream reader can assume both rows always exist, no null-fallback branching.

**Not stored on `buyer_identity`.** No reusable/editable saved address exists anywhere in this model — every checkout collects it fresh. That's the direct answer to "a buyer editing an address later must not change what a past order says": there is no mutable copy to edit. Tradeoff: buyers re-type their address every order; pre-fill from the last order is an obvious v2, not built now.

**Ties to the multi-seller split:** since one checkout can produce N `order` rows, each of those N orders gets its **own** pair of `order_address` rows — the same address data duplicated across every sibling order from that checkout, never shared by reference. Every `order` stays a fully self-contained record.

**Atomic behavior**, one transaction across the whole cart regardless of seller:
1. Find-or-create `buyer_identity` by email.
2. Group lines by the seller owning each variant's product.
3. For every line: conditional stock decrement (`WHERE stock_qty >= quantity`, abort on failure) and compare current `offer.price` to `expectedUnitPrice` if sent.
4. Any single line failing either check fails the **entire** call — no partial orders, no partial stock decrements, even across different sellers.
5. On success: one `order` row per seller group + two `order_address` rows each, `order_line` rows with everything snapshotted, stock decremented.

```
201 {
  buyerIdentityId,
  orders: [
    { id, sellerId, status: "placed", placedAt,
      lines: [ { id, productTitle, variantLabel, quantity, unitPrice } ] }
  ]
}
```

Failure cases, both `409 Conflict`:
- `type: out-of-stock` — `errors[]` lists `{ field: "lines[i].variantId", reason: "requested N, available M" }` per short line.
- `type: price-changed` — `errors[]` lists `{ field: "lines[i].variantId", reason: "expected $X, now $Y" }`. Client re-fetches current prices and either re-submits accepting them (omit `expectedUnitPrice`) or drops the line.

Confirmation page renders straight from this response body — no follow-up `GET` or auth needed for the immediate post-checkout view. Returning to it later (refresh, different device) requires the magic link.

## Order history

`GET /orders` — auth: buyer session required. `Page<OrderSummary>` scoped to `session.identityId`. Each entry is one seller's order (per the split above), so a buyer who checked out across two sellers sees two entries from one purchase.

`GET /orders/{orderId}` — auth: buyer session, `404` (not `403`) if it exists but isn't theirs, to avoid confirming order-id existence to strangers. Full detail with lines and both `order_address` rows.

Reaching it from the email link: the confirmation/history email contains a magic link (`role: buyer`). Clicking it → static page → `POST /sessions` → cookie set → frontend redirects to `/orders`. Same mechanism as any other buyer login, no separate "order lookup" concept needed.

## Seller endpoints

| Method & path | Nesting reason |
|---|---|
| `GET /sellers/me` | profile display (`fullName`, `email`) |
| `POST /products` | flat — seller creates from their own session, `sellerId` taken from auth not body |
| `PATCH /products/{id}` | must own it (`404` if not) |
| `POST /products/{id}/variants` | nested — variant can't exist without its product. Body accepts **flattened** `{ label, sku, price, stockQty }`; server writes `variant` + `offer` in one transaction |
| `PATCH /variants/{id}` | same flattening, writes to both tables |
| `POST /products/{id}/images`, `POST /variants/{id}/images` | as above |
| `GET /sellers/me/order-lines` | nested, real ownership — a seller only ever lists **their own** lines, never whole orders (an order may contain another seller's lines too) |
| `PATCH /order-lines/{id}` | flat path, ownership enforced by auth (`403` if not yours). Body: `{ status: "shipped", trackingNumber }`. No shipping-carrier integration — tracking is a free string the seller types, consistent with everything else cut this round |

## Reviews

`POST /reviews` — auth: buyer session. Body: `{ orderLineId, rating, body }`. Deliberately **not** nested under `/order-lines/{id}/reviews` or `/products/{id}/reviews` — creation references the order line by id in the body, server validates `order_line.order.buyer_identity_id == session.identityId`, then upserts against the `(buyer_identity_id, product_id)` unique key. Reading is nested (`GET /products/{id}/reviews`) because that's the real browsing hierarchy; writing isn't, because ownership is checked via auth, not via URL position. `403` if the line isn't the caller's, `409` if they've already reviewed that product.

## Build order for MSW

1. `GET /products`, `GET /products/{id}` — unblocks the entire buyer browse/detail UI with zero auth.
2. `POST /magic-links`, `POST /sessions`, `GET /sessions/current` — gates nearly everything else.
3. `POST /orders` — checkout is the other buyer-critical path.
4. `GET /orders`, `GET /orders/{id}` — order history screen.
5. `POST /reviews`, `GET /products/{id}/reviews`.
6. Seller portal last, built in parallel once 1–2 are stable: product/variant/image creation, `GET /sellers/me/order-lines`, `PATCH /order-lines/{id}`.
