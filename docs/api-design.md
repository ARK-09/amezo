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
| Buyer sign-in | `POST /auth/buyer/magic-link` + `POST /auth/buyer/verify` | none | **Built** (`identity/BuyerAuthController`). The mirror of the seller pair over the same `MagicLinkAuthService`; a token issued for one identity type is refused by the other's verify endpoint. Exists because a review has to be attributable - before it, the only way to become a known buyer was to place an order, which never created a session. |
| Check session | `GET /sessions/current` | cookie | **Built** (`identity/SessionController`). `200` with the same identity body, or `401`. This is also how the frontend gets "logged in as X" without a separate `/buyers/me`, and how the seller portal finds out on boot whether its cookie is still good. |
| Logout | `DELETE /sessions/current` | cookie | **Not built.** `204`, deleting the `session` row server-side. The seller-only build ships `DELETE /auth/seller/session` instead, which does exactly this; a second logout path would have nothing to add. |

Session cookie TTL: 30 days, no refresh/rotation for MVP. Buyer sessions and seller sessions are the same mechanism (`identity_type` distinguishes them) — no separate seller auth endpoints needed.

## Categories & countries — system reference data

`GET /categories` — the selectable categories, in merchandising order, `{ slug, name }`
each. Public. Retired categories (`active = false`) are left out, so nothing new can be
filed under one, while products already filed under one keep displaying it.

No search parameter: the list is a dozen rows that change about never, so clients fetch
it once and filter in memory rather than issuing a request per keystroke.

The **slug is the stable value** - it travels in `?category=` filters and in product
writes, and it does not change when the display name is edited. The **name is display
only**. Every product response ships both, so no screen needs the list loaded just to
turn one into the other.

Product writes take `categorySlug`, and `CategoryService.requireSelectable` refuses
anything that isn't a live system category with a `404` - which is what makes "no
arbitrary categories" true of the API and not just of the form.

`GET /countries` — ISO 3166-1 alpha-2, ordered by name. Public (checkout is open to
guests). Reference data compiled into the application rather than a table, because the
set of countries is an external standard this marketplace doesn't get a vote on -
`CountryCatalog` reads it from the JDK's own registry. `@ValidCountryCode` on
`CheckoutAddressRequest` validates the submitted code, so a client that skips the
selector cannot store `XX` or the plausible-but-wrong `UK` (the ISO code is `GB`).

## Products & search

### Product URLs are slugs

`product.slug` replaces the id in every product URL:
`/products/classic-cotton-t-shirt`, not `/products/49cec0bd-…`. Generated from the
title once, at creation (`Slugs.uniqueSlug`), and then **stable** - a rename leaves it
alone, because every link already handed out points at the old one. Duplicate titles
count up (`-2`, `-3`); accents fold (`Café` → `cafe`); everything else collapses to
hyphens, so a slug never needs percent-encoding.

`GET /products/{ref}` and `GET /products/{ref}/reviews` accept a slug **or** a legacy
id, so links minted before slugs existed still resolve - the frontend turns those into
a redirect to the slug URL rather than a 404. Writes (`PATCH`, `DELETE`) take the id
only: a slug is for links, and a rename must not be able to retarget an edit.

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

`GET /variants?ids=...` — **proposed, not yet implemented.** Added by the cart-drawer frontend work as the batch-fetch contract a cart drawer needs (one call to re-price/re-check every line by variant id on open), not by any backend change. `ids` is a comma-separated list of variant ids; the response is a flat array of offer-flattened-onto-variant objects, `{ id, productId, productTitle, variantLabel, thumbnailUrl, price, stockQty }` — unlike `variants[]` above, which nests under one product, `/variants` results are denormalized with their own `productId`/`productTitle` since a batch response can span multiple products; ids that don't exist are simply omitted from the response rather than erroring. No Spring controller implements this yet — see `frontend/openapi/fixture.yaml` for the placeholder contract the frontend codegens against in the meantime. Relatedly, despite being documented above, `GET /products/{productId}` itself is also not yet implemented in the backend: only `GET /products` with `q` is currently wired end-to-end (see `ProductController.java`), so the flattening example above doesn't reflect working code today.

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

**As built**, three differences from the sketch above, all deliberate:

- The paths are `POST /products/{id}/images/upload-url` and `POST /products/{id}/images/confirm` (a body carrying the image id) rather than `POST .../images` + `PATCH /images/{id}`. `/variants/{variantId}/images` was never built — see the variant note below.
- Presigned **PUT**, not POST-with-policy. The size range the sketch wanted POST for is covered differently: `fileSizeBytes` is required and signed into the URL as `Content-Length`, so the upload can only be exactly the size the seller declared, and the request is refused up front if that size breaks the per-file limit or the deployment's total storage cap.
- The S3 HEAD on confirm **is** implemented: the object must exist or confirm answers `409 upload-not-found` and the row stays `pending`. HEAD's `Content-Length` also replaces the declared size on the row, so the storage cap counts what the bucket holds rather than what a client claimed.

Deleting a product deletes its objects from the bucket as well as its rows — after the transaction commits, so a rolled-back delete can't strand a live product with 404ing images. A bucket that refuses the delete is logged, not fatal: the rows are already gone.

**Deleting a sold product** is `409 product-has-orders`, not a delete. `order_line.offer_id` is a real foreign key on purpose — an order stays traceable to the offer it was placed against — so the row physically can't go, and the endpoint says so instead of returning the constraint violation as a 500. The seller's alternative, named in the message, is setting the variants' stock to 0. Archiving (a `deleted_at` that hides a product from the catalog while keeping its order history) is the real answer and isn't built.

**As built, the seller's variant and image management**: `POST /products/{id}/variants` adds one (SKU collision → `409 sku-taken`); `DELETE /variants/{id}` removes one, refused with `409 variant-has-orders` when it has been bought and `409 last-variant` when it's the product's only one, since create requires at least one and a product with none has no price to show; `DELETE /images/{id}` removes an image row and its object. Upload now also refuses an eighth image (`409 too-many-images`) — the read path renders at most 7, so beyond that an upload would cost storage and never appear.

**Variant-level images** are modeled (`image.variant_id`, with the table's `product_id IS NOT NULL OR variant_id IS NOT NULL` check) but nothing writes them — no endpoint accepts a variant id, `VariantDetail` carries no images, and the product page's gallery is product-level. Product deletion clears variant-linked rows anyway, so wiring them later can't trip `image.variant_id`'s foreign key.

### Seller read of one product

`GET /sellers/me/products/{productId}` — auth: owning seller, `404` otherwise. The portal's view/edit page reads this rather than the public `GET /products/{id}`, for two reasons the page depends on: variants carry exact `stockQty` (the buyer-facing shape reduces it to an `inStock` flag, and a number is what a seller edits) and SKUs, and images include `PENDING` ones so an upload that never completed is visible instead of silently absent.

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
| `POST /sellers/me/products` | flat — seller creates from their own session, `sellerId` taken from auth not body. Under `/sellers/me/` rather than `/products` so the whole namespace is seller-only in one security rule |
| `PATCH /products/{id}` | must own it (`404` if not). Built: partial update, an omitted field is left as it is, and a blank title or category is `422` rather than stored |
| `POST /products/{id}/variants` | nested — variant can't exist without its product. Body accepts **flattened** `{ label, sku, price, stockQty }`; server writes `variant` + `offer` in one transaction |
| `POST /products/{id}/variants` | nested — a variant can't exist without its product. Built: flattened body, written to `variant` + `offer` in one transaction |
| `DELETE /variants/{id}` | must own the product. Built: `409` if sold or last |
| `DELETE /images/{id}` | must own the product. Built: row and object both |
| `PATCH /variants/{id}` | same flattening, writes to both tables. Built: label/sku on the variant, price/stockQty on its offer; a SKU another variant already holds is `409 sku-taken`, checked before the unique index so the seller learns which field collided |
| `POST /products/{id}/images`, `POST /variants/{id}/images` | as above |
| `GET /sellers/me/order-lines` | nested, real ownership — a seller only ever lists **their own** lines, never whole orders (an order may contain another seller's lines too) |
| `PATCH /order-lines/{id}` | flat path, ownership enforced by auth (`403` if not yours). Body: `{ status: "shipped", trackingNumber }`. No shipping-carrier integration — tracking is a free string the seller types, consistent with everything else cut this round |

## Reviews

`POST /reviews` — **Built.** auth: buyer session. Body: `{ orderLineId, rating, body }`.
Three refusals, each different on purpose: `404` if the line doesn't exist, `403` if it
belongs to a different buyer (citing someone else's order number is the obvious way to
fake a purchase), and `409 already-reviewed` for a second review of the same product -
which is what the schema's `UNIQUE (buyer_identity_id, product_id)` has always said.
The product is taken from the line's snapshot, never from the request, so a valid line
cannot be used to review something else.

`GET /products/{ref}/reviews/eligibility` — **Built.** auth: buyer session. Answers
`{ eligible, reason, orderLineId, existingReview }` so the product page can offer a
form, say "only buyers can review this", or show what they already wrote - rather than
handing over a form that 403s on submit. Buyer-scoped, which is why it is its own
request instead of a field on the public (cacheable) product response.

The original sketch of `POST /reviews`: Deliberately **not** nested under `/order-lines/{id}/reviews` or `/products/{id}/reviews` — creation references the order line by id in the body, server validates `order_line.order.buyer_identity_id == session.identityId`, then upserts against the `(buyer_identity_id, product_id)` unique key. Reading is nested (`GET /products/{id}/reviews`) because that's the real browsing hierarchy; writing isn't, because ownership is checked via auth, not via URL position. `403` if the line isn't the caller's, `409` if they've already reviewed that product.

## Build order for MSW

1. `GET /products`, `GET /products/{id}` — unblocks the entire buyer browse/detail UI with zero auth.
2. `POST /magic-links`, `POST /sessions`, `GET /sessions/current` — gates nearly everything else.
3. `POST /orders` — checkout is the other buyer-critical path.
4. `GET /orders`, `GET /orders/{id}` — order history screen.
5. `POST /reviews`, `GET /products/{id}/reviews`.
6. Seller portal last, built in parallel once 1–2 are stable: product/variant/image creation, `GET /sellers/me/order-lines`, `PATCH /order-lines/{id}`.
