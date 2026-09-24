# Buyer/seller problems on Amazon today (v2 — product-surface bar)

**Revision note:** v1 of this doc mostly listed policy positions ("don't sell ad placement," "don't run anti-discount pricing," "don't auto-suspend sellers") — nothing to build, no data model, no screen. Four of five failed the actual bar. This version replaces the list: every problem below implies a concrete screen/flow and a concrete piece of state the system has to store. Still 3 buyer-side, 2 seller-side, still sourced.

## Buyer-side

### 1. Counterfeit/substituted units reach buyers through pooled inventory

**One-line:** When multiple sellers' stock of the "same" SKU is stored together, a buyer can receive a different physical unit than the one their seller sent — including counterfeits.

**Who it affects:** Buyers expecting an authentic item; the legitimate seller whose brand absorbs the complaint.

**Why it happens:** Warehouse pooling ships whichever physical unit is closest, not necessarily the one the paying seller supplied. If one seller contributes a fake or damaged unit under a shared SKU, any buyer on that listing can receive it.

**Source:** [After years of backlash, Amazon finally ends a practice that many sellers have long loathed — GeekWire, 2025](https://www.geekwire.com/2025/after-years-of-backlash-amazon-finally-ends-a-practice-that-many-sellers-have-long-loathed/); background in [Designerly: Commingled Inventory May Be the Source of Amazon Counterfeits](https://designerly.com/amazon-counterfeits/).

**Product surface:** Order detail and product page show a provenance line — "This unit: sold by [Seller], lot #[X], received [date]" — not just the generic "Ships from/Sold by" badge.

**What the system stores:** An `inventory_unit` record per physical unit (`seller_id`, `lot_id`, `listing_id`, `received_at`), and each `order_line` references the specific `inventory_unit_id` fulfilled — not just the listing. This is a real schema decision (unit-level identity vs. pooled-by-SKU), not a policy choice.

**Tension:** Per-unit tracking means every seller — not just bad actors — does more handling work (unique labels, lot registration) before Amazon will accept their stock. Buyer trust goes up; seller onboarding friction goes up with it.

### 2. Listing/variation hijacking makes reviews untrustworthy for the item actually being sold

**One-line:** Sellers reuse a listing's accumulated reviews after swapping in a different product, or fold an unrelated item into a "variation family" so its reviews inherit the parent's rating.

**Who it affects:** Buyers reading star ratings/reviews as a purchase signal; honest sellers whose listings get hijacked out from under them.

**Why it happens:** Amazon pools reviews across all variations (color/size) of a listing and doesn't strongly gate edits to a listing's core identity, so a seller can change what's being sold while keeping the review history intact.

**Source:** [Consumer Reports: Hijacked reviews on Amazon can trick shoppers](https://www.consumerreports.org/customer-reviews-ratings/hijacked-reviews-on-amazon-can-trick-shoppers); [BuzzFeed News: Here's Another Kind Of Review Fraud Happening On Amazon](https://www.buzzfeednews.com/article/nicolenguyen/amazon-review-reuse-fraud); mechanism explained in [Null Fake: Product Listing Hijacking Explained](https://nullfake.com/blog/amazon-listing-hijacking-explained).

**Product surface:** Each review is tagged to the exact variant/version a reviewer bought and displayed against that variant, not pooled blindly. A visible "listing history" panel on the product page flags when the title, primary image, or category changed materially, with a date.

**What the system stores:** `listing_revision(listing_id, changed_at, changed_fields, diff)` on every material edit; `review(order_id, variant_id, listing_revision_id_at_purchase)` so a review can always be traced to what was actually sold at purchase time.

**Tension:** A public change-history makes hijacking visible to buyers, but it also exposes every legitimate seller's routine listing edits (better photos, clearer bullets) as a visible timeline — normal iteration starts to look suspicious, which discourages sellers from improving listings.

### 3. "Marked delivered, not received" disputes have no evidence trail buyers can see themselves

**One-line:** Carriers scan packages as delivered before they physically arrive (or they're stolen after drop-off), and buyers have no way to see delivery evidence without opening a support case and waiting.

**Who it affects:** Buyers disputing a charge for an item they never got; sellers who eat chargebacks either way.

**Why it happens:** Delivery confirmation is carrier-side data (GPS scan, sometimes a photo) that Amazon's own claims process references internally but doesn't surface to the buyer up front — the current flow ("Your Orders" → "Problem with order" → wait) is a support ticket, not a self-serve evidence check.

**Source:** [Amazon A-to-Z Claims for Sellers: A Complete Guide — SalesDuo](https://salesduo.com/blog/amazon-a-to-z-claim-guide-for-sellers/); carrier-side scan timing issue described in [ParcelPath: Amazon Your Package May Be Lost But Delivered](https://parcelpath.com/amazon-your-package-may-be-lost-but-delivered/).

**Product surface:** Order detail page shows the delivery scan itself — timestamp, geolocation pin, doorstep photo if the carrier captured one — inline, before the buyer has to open a claim. If they still dispute it, a structured claim tracker (opened → evidence attached → decision) replaces an opaque support thread.

**What the system stores:** `delivery_event(order_id, carrier, scanned_at, geo_lat, geo_lng, proof_photo_url)`; `claim(order_id, status, evidence[], opened_at, resolved_at, resolution)`.

**Tension:** Surfacing carrier evidence speeds up resolution, but it cuts both ways — a GPS pin or doorstep photo that shows correct delivery can be used to deny a legitimate "it was stolen off my porch" claim just as fast as it validates a bogus one. Faster resolution isn't automatically fairer resolution.

## Seller-side

### 4. Returns get refunded before anyone verifies what came back

**One-line:** Buyers can return an empty box, a different/cheaper item, or trash as ballast, and the seller is refunded out of their own payout before any inspection happens.

**Who it affects:** Sellers, who lose both the item and the sale; the cost ultimately gets priced into everyone's margins.

**Why it happens:** The return flow issues a label and processes a refund on the stated reason without requiring evidence at intake, and sellers only get a chance to contest it after the money has already moved (via a separate reimbursement claim).

**Source:** [Amazon Return Fraud Threatens Marketplace Sellers — Chargebacks911](https://chargebacks911.com/amazon-return-fraud/); [Fraudulent Amazon Returns: What you need to know — RefundRetriever](https://www.refundretriever.com/blog/fraudulent-amazon-returns-what-you-need-to-know); seller reports of empty-box returns in the [Amazon Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/246f390c-7be6-4714-9051-55605605fa3c).

**Product surface:** The return-request flow requires the buyer to state a reason and attach a photo of the item before a label is issued. Returns above a risk threshold (reason mismatch, high-value item, buyer's return history) route to a review queue where a human grades condition against the photo before the refund fires, instead of after.

**What the system stores:** `return_request(order_id, reason, photos[], risk_score, condition_grade, status)`; `dispute(return_request_id, seller_evidence, outcome)` for the cases a seller contests.

**Tension:** Gating refunds behind photo evidence and review protects sellers but adds friction and delay to every honest return, working against the fast, no-questions-asked refund experience that buyers have come to expect and that drives purchase confidence in the first place.

### 5. Sellers can't see why they're losing the featured-offer slot or what would change it

**One-line:** The algorithm that picks which seller's offer gets the primary "Buy Now" placement weighs price, fulfillment speed, and account health, but sellers only see whether they won, not which factor is costing them.

**Who it affects:** Third-party sellers competing for the featured-offer slot that the large majority of purchases go through.

**Why it happens:** Amazon discloses that factors exist but not their relative weight or a seller's specific standing on each one, so sellers are left guessing and re-pricing blindly. This got bad enough that EU regulators required Amazon to improve it.

**Source:** [Why Your Amazon Listing's Buy Box Might Disappear — TrackStreet](https://www.trackstreet.com/blog/why-your-amazon-buy-box-might-disappear---and-what-to-do-about-it); [Euronews: Amazon agrees reforms to close two EU investigations](https://www.euronews.com/my-europe/2022/12/20/retail-giant-amazon-agrees-reforms-to-close-two-eu-investigations) (EU-mandated commitment to increase Buy Box transparency for sellers).

**Product surface:** A per-listing dashboard panel breaking down featured-offer eligibility into its components — price gap vs. the current winning offer, fulfillment-speed score, account-health score — with a trend line over time, so a seller can see exactly what changed when they lost the slot.

**What the system stores:** `offer_score(listing_id, seller_id, computed_at, price_score, fulfillment_score, account_health_score, eligible)`, computed and retained on every re-ranking so history is queryable, not just the current snapshot.

**Tension:** The same transparency that helps a legitimate seller compete also hands bad actors a precise map of what to game — e.g., exact price-matching thresholds invite coordinated price wars, and a visible account-health formula tells rule-benders exactly how close to the line they can stay.

## What didn't work

*(fill in)*
