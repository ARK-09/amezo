# Design gaps

Where the implemented screens differ from the supplied designs, verified against
both the `.dc.html` templates and the current code. Nothing here is a bug — the
screens work; these are parts of the design that were not built, or were built
differently.

Ranked by user-visible impact. **Size** is S (a control or section), M (a feature
with state, roughly a day), L (needs new API surface or substantial work).
"Needs API" means the contract in `frontend/openapi/fixture.yaml` has nothing to
call.

`Amezo Portal.dc.html` is excluded — deferred.

---

## 1. Seller Products — the read-only detail drawer does not exist · M, partly needs API

The design has **two** overlays. Clicking a row opens a read-only detail drawer
(`aria-label="Product details"`): image strip, three stat tiles
(Price / Stock / **Open orders**), an **Active orders** list, a variants table,
description, a `Created / Last updated / ID` footer, and an `Edit product` +
`Delete` action bar. The edit form is a *separate* drawer reached from Edit.

We only built the edit form. Rows have no click handler
(`SellerProducts.tsx:264`), and `SellerProductDetail.tsx` — the full-page route —
is also just the form.

Most fields are already on `SellerProductDetail`. The **Active orders** block is
the exception: `GET /api/v1/sellers/me/orders` takes `q`/`status`/`sort`/`page`/
`size` and has no `productId` filter.

## 2. Store page ignores the store profile entirely · M, L for the rest

The design has a cover band, circular logo, rating + "Verified seller", a 4-cell
stat strip, an **About this store** section, a **Store policies** list
(Shipping / Returns / Warranty / Ships from), **Follow** and **Message** buttons,
and a **Search in this store** box.

`StoreFront.tsx:113` renders a hard-coded striped placeholder and a generic icon.
Worse, **the page never calls `GET /api/v1/stores/{handle}` at all** —
`useStoreProducts.ts:22` scans `GET /products?size=100` and filters by
`brandName` in the browser, and the route is `/stores/:brand`, not by handle.

Wiring the existing endpoint is M and also deletes the 100-product scan; it
already returns `coverUrl`, `logoUrl`, `tagline`, `about`, `vacationNote`,
`productCount`, `inStockCount`, `averageRating`, `ratingCount`. Policies, follow,
message and in-store search are **L — none exist in the contract.**

## 3. Store Settings — Branding section missing · L, needs API

The design opens with a `Branding` section above Identity: a cover drop-zone
("1600 × 400 or wider · JPG or PNG · up to 5 MB", `Remove cover`) and a circular
logo uploader with an initials fallback. The storefront preview renders both.

`StoreSettings.tsx:196` goes Identity → Availability → Preview; `Draft` has no
cover or logo field.

`coverUrl`/`logoUrl` are on `StoreProfile` and `UpdateStoreProfile`, but there is
**no presigned-upload endpoint for store images** — the only upload path is
product-scoped (`/products/{productId}/images/upload-url`). A URL-only field
would drop this to M.

## 4. ACTIVE / DRAFT toggle on the product form · S–M

The design's form header carries an Active/Draft switch with the hint "Saved to
your catalogue but hidden from shoppers until you activate it."

Nothing sets status. `DRAFT` appears only as a badge tone
(`StatusBadge.tsx:23`) and a filter option (`SellerProducts.tsx:163`).

The contract side is now closed: `UpdateProductRequest.status`,
`CreateProductRequest.status` and `SellerProductDetail.status` all exist. What
remains is the UI control and passing the value through `ProductFormPanel`.

## 5. Seller Refunds — three-way decision mode switch · M

The design uses a segmented control — **Approve refund / Send replacement /
Decline** — and swaps the body per choice: Approve shows the amount with a
**"Full $X"** shortcut; Replacement shows a note; Decline requires a reason and
an explanation. There is also an "Approved · waiting on the return" state with
**Undo approval**, and a History timeline.

`RefundDecisionPanel.tsx:186` shows the approve amount and the decline reason
**side by side at once** — the select is labelled "Reason, if declining" — then a
row of buttons. Replacement is never *chosen*; it is derived from
`request.resolution`. No full-amount shortcut, no undo, and `payout` is never
displayed although `RefundRequestDetail` carries it.

No new API: `UpdateRefundRequest` accepts any `RefundStatus`. Worth confirming
the server will allow `REQUESTED → REPLACEMENT_SENT` directly.

## 6. Seller Dashboard — "Recent orders" widget missing · S

The design has four widget slots: ship, low stock, **recent orders**, refunds.
We built three (`SellerDashboard.tsx:275`). Needs only
`useSellerOrderRows({ size: 5, sort: 'newest' })`; the hook is already imported
on that page.

## 7. Seller Dashboard — category donut substituted with a bar list · S

The design renders an SVG donut with a centre total and a swatch legend.
`SellerDashboard.tsx:254` renders `ShareList`, a stack of single-hue progress
bars. `CategoryShare` already returns everything needed and recharts is already a
dependency.

## 8. Status tab strips with counts and money values · M, needs API for the numbers

Seller Orders uses a 6-tab strip (All / To pack / Ready for pickup / With Amezo /
Delivered / Refunded), each tab showing **both** a count and that bucket's
revenue, plus a header line ("N to pack · N waiting on Amezo pickup · N orders
total"). Seller Refunds does the same with 4 tabs. My Orders' tabs carry counts.

Seller Orders has **no tabs at all** — a plain "Filter by status" select over the
raw 7-value enum (`SellerOrders.tsx:146`). Seller Refunds has tabs without counts;
My Orders' tabs have no counts.

Converting the control to tabs is S. The counts and bucket values need either 5–6
parallel queries or a new counts endpoint — the contract has neither.

## 9. Numbered pagination, per-page selector, range label · S

The design has `Prev · 1 2 3 · Next`, a "Showing 1–5 of 8" range label, and a
**Per page** select (5/10/20/50). We render `Previous / Page N of M / Next` with a
fixed page size on all five lists.

`src/components/ui/pagination.tsx` already exists and **nothing imports it**.

## 10. Seller Dashboard — Top products flattened, and a KPI swapped · S, delta needs API

The design's Top products is a 5-column table (`# / Product (with "N units · $X
each") / Revenue / Share / vs prev`) with a "Top 5 share of $X" footer. The KPIs
are Revenue, Orders (caption "$X average order"), **Stock alerts** (2 out of
stock · 3 below 10 units), Conversion rate ("N store views").

We reuse the same `ShareList` as the category panel — no rank, units, AOV,
vs-prev or footer — and the third KPI is Views, not Stock alerts. `StatTile`
renders no caption line.

Everything is available except the per-product **vs prev** delta: `TopProduct`
carries no previous-window figure.

## 11. My Orders — inline Reviews section inside an expanded order · M, edit needs API

The design puts a Reviews block after Items inside an expanded order: a clickable
5-star row, an idle hint, an editing state (textarea, submit, cancel, character
count), and a published state with **Edit review**.

`OrderCardDetail.tsx` ends at Items/totals; `OrderCard.tsx:159` links out to
`/products/{ref}?review=1` instead.

`POST /reviews` and the eligibility endpoint exist. **Edit review needs a new
endpoint** — there is no `PATCH`/`PUT /reviews/{id}`.

## 12. Seller order composer — no "Refunded" stage, no date field · resolved differently

The design's compose stages are `Packed / Handed over / Refunded`. Refunded adds
an amount (validated ≤ order total) and a reason select, posting as "Refund $X".
Every mode has a **Date** input.

`SellerOrderPanel.tsx:28` types `Stage = 'PACKED' | 'SHIPPED'` and renders two
chips. `OrderStatus` has no `REFUNDED` value and `UpdateSellerOrder` has no
amount, reason or date field.


**Resolved, not built as designed.** The composer will not gain a Refunded
stage. Refunds are already modelled by `refund_request` — its own state machine,
approval and return steps, and money — so a composer that also declared an order
refunded would be a second writable source of truth for one fact. Instead
`REFUNDED` is on `OrderStatus` as a **derived** value: the server reports it once
the order's refund request settles, `UpdateSellerOrder` will not accept it, and
the Refunds queue stays the one place a refund is decided. The design's per-mode
**Date** field was built, as `UpdateSellerOrder.occurredAt`.

## 13. Product Form — missing controls in edit mode · S, reorder is M and needs API

Images need move-earlier/move-later and a **Cover** badge on the first; variant
rows need **Duplicate** (appends `-COPY` to the SKU); the section closes with a
`Price range / Total stock / Images` summary strip; the title field shows a
`N/120 characters` counter.

`ProductFormPanel.tsx:596` lists images with a delete button and a `#N` label
only. Note that reorder **is** implemented on the create form
(`SellerAddProduct.tsx`), so edit mode is the odd one out — but there is no
image-reorder endpoint (`/images/{imageId}` is DELETE-only).

## 14. Dashboard widgets — no per-row actions or secondary data · S

Ship-queue rows should show buyer, item summary, an age badge (overdue/on-time)
and a **Ship** link; low-stock rows the SKU and a **Restock** link; refund rows
the buyer, the reason and a **Review** link; the refunds header a note
("2 open · $311"). Our rows are label + badge/amount, no actions, no second line.

## 15. Seller Dashboard — panels are not reorderable · M

Every chart and widget in the design is a drag handle plus `Move earlier` /
`Move later`, driven by `chartOrder` and `widgetOrder`. Ours is a fixed grid.
Purely client-side state.

## 16. Product Details — spec block and "Save for later" · S, then L

A `SKU / Delivery / Returns` list under the variant picker, a spec table under
the Details tab (Battery life, Connectivity, …), and **Save for later** under Add
to cart. `ProductDetail.tsx:78` goes straight to the variant selector and the
Details tab is a bare paragraph.

The SKU/Delivery/Returns block is S (SKU is on the variant; the other two are
static copy). Specs and Save for later are **L — no product attributes and no
wishlist surface in the contract.**

---

## Checked and *not* a gap

- **Buyer-facing reviews are implemented.** `ProductDetail.tsx:117` renders a
  Reviews tab with the average, star row, count, paged list and an
  eligibility-gated form. What is missing is only the *inline* block inside an
  expanded order on My Orders — item 11.
- **The seller order drawer is not meant to be read-only.** The design's order
  drawer is fully editable (stage chips, parcels, handover method, hub, note,
  Post) and ours matches it closely. The read-only-drawer gap applies to
  **Products** only — item 1.
