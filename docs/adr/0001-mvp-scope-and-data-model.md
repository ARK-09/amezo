# 1. MVP scope: plain marketplace, defer warranty and refund differentiators

Date: 2026-09-24

## Status

Accepted

## Context

Three passes of grounded, sourced research (`docs/research/buyer-seller-problems.md`, `buyer-seller-problems-opus5.md`, `problems-pass-3.md`) identified real, product-shaped problems with Amazon today, each with a concrete screen and a concrete data-model gap. Two were selected as MVP differentiators:

1. Warranty belongs to the offer, not the product.
2. Refund custody and settlement (separate `issued` vs `settled` states, evidence-gated reversal).

A full scope pass combining both differentiators with a complete marketplace (catalog, search, reviews, cart/checkout, auth, seller/brand/admin portals) was reviewed for cuts and contradictions. That review surfaced 21 gaps, several of which are only real problems *because* the two differentiators are in scope: a payment processor is meaningless without refund settlement to confirm; an admin role is only needed to adjudicate warranty-reversal disputes; brand login/verification only matters if brands publish warranty terms; multi-seller-per-product only matters so there's something to compare coverage against.

Given the size of what a correct version of both differentiators requires (real payment processor integration, carrier event simulation, an admin role, brand verification, warranty versioning/revocation), building either into the first shippable version risks shipping neither. The decision was made to cut both from the MVP entirely rather than build a stubbed/fake version of either — a stubbed refund-settlement flow in particular would reproduce the exact bug the research was about (the platform's own code claiming a refund settled when no external processor confirmed it).

## Decision

Ship a plain single-seller-per-product marketplace as the MVP. Warranty-on-offer and refund-custody-and-settlement move to `docs/next-build.md`, fully data-modeled (entities, state machines, illegal transitions, open decisions), not built now.

### MVP scope

- **Buyer:** browse/search (Postgres FTS)/filter/sort, product detail (variants, images, reviews, stock), cart CRUD, guest checkout capturing email and full name (no payment provider — checkout records an order and ends), order history and tracking reached via magic link on the order email.
- **Seller:** magic-link login (required), create products/variants/images/offers with price and stock, mark own orders shipped with a tracking string, see own orders.
- **Reviews:** tied to a purchased order line, magic-link verified (not a typed email — a typed string proves you know an address, not that you control it), one per buyer per product.

### MVP data model

```
seller(id, email, full_name, created_at)
buyer_identity(id, email, full_name, created_at)
magic_link_token(id, identity_type: buyer|seller, identity_id, email,
                  token_hash, expires_at, consumed_at)

product(id, seller_id, title, brand_name, description, category,
        search_vector tsvector generated, created_at)
variant(id, product_id, label, sku)
image(id, product_id, variant_id nullable, s3_key, position)
offer(id, variant_id, price, stock_qty)

order(id, buyer_identity_id, buyer_email_snapshot, placed_at,
      status: placed|shipped|delivered, tracking_number nullable,
      shipped_at nullable)
order_line(id, order_id, offer_id, product_id_snapshot, variant_id_snapshot,
           seller_id_snapshot, unit_price_snapshot, quantity)

review(id, order_line_id, buyer_identity_id, product_id, rating, body,
       created_at)  -- unique(buyer_identity_id, product_id)
```

### Assumptions made explicit (not stated in the original scope ask)

1. **One seller per product, no shared canonical product across sellers.** The multi-seller-per-product model exists only to support the two deferred differentiators (comparing coverage/price across sellers on the same listing). Without them, there's nothing to compare, so product matching/deduplication across sellers is out of scope. `offer` is still kept as its own table (not folded into `variant`) specifically so the warranty field and multi-seller offer model in `next-build.md` attach later without re-splitting the schema.
2. **Cart is client-side state only, no server-side cart table.** No payment provider and no pre-checkout identity to attach a server cart to; checkout is a single atomic call that creates the order directly from the submitted line items.
3. **Sellers can mark an order shipped and attach a tracking string.** The original ask specified buyer-side "tracking" but only "see own orders" (read-only) for sellers; without a seller-side write action, tracking has no source. This is the minimum addition that makes it meaningful.
4. **`quantity` lives directly on `order_line`.** The one-unit-per-order-line split from the deferred differentiators' design existed only so returns/warranty claims could target an individual physical unit. Not needed here.

## Consequences

- Faster to ship: no payment integration, no carrier simulation, no admin role, no brand verification needed for v1.
- Stock correctness (`offer.stock_qty` as a real integer with conditional decrement) and purchase-time snapshotting on `order_line` are kept regardless — these are basic correctness, not differentiator-specific.
- Reviews sit on `product_id` without a cross-seller pooling hazard, because there is exactly one seller per product in this model — a side effect of assumption 1, not a separate design decision.
- Picking either differentiator back up later means reintroducing multi-seller-per-product first; that reshapes `product`/`offer` more than it reshapes the differentiator schemas themselves, which are already fully designed in `docs/next-build.md`.
- The three research documents and `next-build.md` are the durable record of what was found and why; this ADR is the record of why it wasn't built now.
