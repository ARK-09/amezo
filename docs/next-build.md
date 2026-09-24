# Next build: deferred differentiators

The MVP ships as a plain marketplace (see main scope/data model). These two features were the actual point of the project — they came out of three passes of sourced research into real Amazon problems (`docs/research/buyer-seller-problems.md`, `buyer-seller-problems-opus5.md`, `problems-pass-3.md`) — but got cut from the MVP for scope. Both were already data-modeled down to entities and state machines before the cut. Captured here so that work isn't lost.

Building either of these later effectively means re-introducing multi-seller-per-product (the plain MVP assumes one seller per product — see the MVP data model's note on this). That's the real cost of picking either back up, not the schema below, which is already done.

---

## Differentiator 1: warranty belongs to the offer, not the product

**The problem (source: `problems-pass-3.md` #2):** Amazon models warranty on the product. Brands void warranties bought from unauthorized sellers, but every seller shares one product page, so the page can't say whose coverage applies. Buyers pick the cheapest offer and find out they have no warranty when a claim is denied.

### Entities

```
warranty_terms(id, warrantor_type: brand|seller, warrantor_id, product_id,
               duration_months, coverage_text, doc_url, version,
               effective_from, effective_to)

brand_authorization(id, brand_id, seller_id, product_id nullable,
                     verified_at, expires_at, revoked_at)
-- product_id nullable = brand-wide authorization, not per-product

offer.warranty_terms_id  -- nullable FK, added to the base offer table

order_line_warranty(id, order_line_id, warranty_terms_id,
                     warrantor_type, warrantor_id, warrantor_name_snapshot,
                     coverage_text_snapshot, duration_months_snapshot,
                     starts_at, ends_at, voided_at nullable)
-- frozen copy taken once at purchase; disputes read this, never the live row

warranty_claim(id, order_line_warranty_id, opened_at, issue_description,
               status, decision_type: repair|replace|refund|deny|withdrawn,
               decided_at, fulfilled_at, fulfillment_evidence_id nullable,
               prior_claim_id nullable)
```

### State machine

```
OPEN --decide(repair|replace|refund)--> DECIDED --fulfill--> FULFILLED --> CLOSED
OPEN --decide(deny)--------------------> DECIDED --------------------> CLOSED
OPEN --withdraw-------------------------------------------------------> CLOSED
```

Illegal: `OPEN -> FULFILLED` (no decision to fulfill), `DECIDED(deny) -> FULFILLED`, `FULFILLED -> DECIDED` (bad fulfillment opens a new claim via `prior_claim_id`, never reopens), `CLOSED -> anything`.

### Open decisions for when this gets built

- **No admin role exists in the plain MVP.** Brand verification needs one — someone has to check a brand claim against the trademark registry by hand. Without it, a fake brand can publish a bogus "authorized seller" list and make every competitor's offer show "no manufacturer warranty" (this is exactly what `problems-pass-3.md`'s pass-2 sibling doc flagged for takedown abuse — same mechanism, different target).
- **Versioning/revocation on live offers.** Publishing warranty_terms v2 must repoint every authorized seller's offer in one transaction — don't let offers point at stale versions. Revoking a seller must not cascade into the offer table automatically; check `brand_authorization` live, at read time and at freeze time, so a revoked seller's offer correctly shows "no manufacturer warranty (authorization revoked)" without a background job.
- **A 4th warranty state is needed: unknown.** manufacturer / seller / none isn't enough — most brands won't be onboarded, and labeling their products "no manufacturer warranty" is actively false. Add "not verified (brand not on platform)" and never let the checkout coverage-comparison call `unknown` worse than a stated tier.
- **"Less coverage" at checkout needs a real order, not text comparison.** `coverage_text` is free-form; only flag "less" when strictly worse by tier (manufacturer > seller > none) or same tier with shorter duration. State facts, never interpret the free text.
- **Claim fulfillment has no money-movement path of its own.** A claim decided as "refund" doesn't have anywhere to plug into if refund/custody (differentiator 2) isn't built. Minimal fix if built alone: the warrantor attests fulfillment with evidence ("refund sent, ref X"), no real payment wiring.
- **Re-resolve warranty inside the order-placement transaction**, not just at checkout-display time — a cart can sit long enough for an authorization to change between checkout view and order placement.

---

## Differentiator 2: refund custody and settlement

**The problem (source: `buyer-seller-problems-opus5.md` #1):** Amazon settled a class action for $309.5M because it "issued a refund without the payment completing" — i.e. it treated issuing a refund and the refund actually clearing as the same event. Buyers found out about reversals from their bank statements.

### Entities

```
return_request(id, order_line_id, reason, requested_at, status)

return_custody_event(id, return_request_id,
                      type: label_created|dropped_off|carrier_scan|
                            received_at_facility|received_no_scan|
                            graded_match|graded_mismatch,
                      occurred_at, location, actor, evidence_id nullable)

refund(id, source_type: return|warranty_claim, source_id, order_line_id,
       amount, status: pending|issued|settled|failed|reversed,
       processor_ref, issued_at, settled_at)

refund_reversal(id, refund_id, reason_code, evidence_id,
                 notice_sent_at, charge_scheduled_at,
                 charge_status: scheduled|charged|settled|failed,
                 charge_processor_ref, disputed, outcome)

evidence(id, attached_to_type: return_custody_event|warranty_claim|refund_reversal,
         attached_to_id, url, uploaded_by, uploaded_at, status: pending|stored)
```

### State machine

```
return_request: REQUESTED -> LABEL_ISSUED -> IN_TRANSIT -> RECEIVED -> GRADED
                GRADED(match)    -> CLOSED_REFUNDED  (spawns refund: PENDING)
                GRADED(mismatch) -> CLOSED_DENIED

refund: PENDING -> ISSUED -> SETTLED
                         \-> FAILED   (payment never completed)
              SETTLED -> REVERSED    (only via refund_reversal, evidence + notice required)
```

Illegal: any `-> REQUESTED` (no going backward), `CLOSED_* -> anything` (a later dispute is a new `return_request`), `PENDING -> SETTLED` (skips ISSUED), `ISSUED -> REVERSED` directly (this is the actual bug — payment never completing is `ISSUED -> FAILED`, not a reversal), `FAILED -> SETTLED` (retry creates a new `refund` row via `retry_of_refund_id`), `REVERSED` without `notice_sent_at < charge_scheduled_at`.

### Open decisions for when this gets built

- **The refund-timing choice is unresolved and changes everything.** Refund-after-grading (safer for sellers) means a mismatch just denies the return — there's never a settled refund to reverse, so half this feature (reversal, notice, dispute window) has no trigger. Refund-on-first-carrier-scan (buyer-friendly, and the actual Amazon policy that caused the harm) gives reversal a real trigger: mismatch closes the return, which spawns the reversal against the already-settled refund. Pick one before building; don't build reversal machinery with nothing that can fire it.
- **This feature is meaningless without a real payment processor.** If the platform's own code flips `issued -> settled`, it's rebuilt the exact bug from the lawsuit. `settled` only means something when an outside party (Stripe webhook) confirms it, later, idempotently (store the event id, processors retry). No processor exists in the plain MVP.
- **`refund_reversal` needs its own issued/settled states**, already added above — the charge that lands on the buyer's bank statement is what the real lawsuit was about; it can't be a bare timestamp.
- **Charging a guest's card weeks later has prerequisites decided at checkout time**, not addable retroactively: a saved Stripe Customer + `setup_future_usage: off_session`.
- **The no-skip custody rule needs an escape hatch.** Real carriers miss scans. If nothing can move a return past IN_TRANSIT because no scan ever came, the buyer never gets refunded. `received_no_scan` (added above) lets a seller record receipt without a carrier event, gated on its own evidence, so the gap stays visible instead of the return silently stalling.
- **Evidence rows need a confirm step**, already added above (`status: pending|stored`) — issuing a presigned upload URL isn't proof the file was stored; the reversal's evidence requirement can otherwise be satisfied by an upload that never happened.
- **Needs a carrier feed and a scheduler that don't exist yet**: a dev-only simulator posting fake carrier events to the same endpoint a real webhook would hit, and a scheduled job for notice-window / dispute-window expiry plus a reconciler that flags returns received with no settled refund after N days.
- **One active remedy per order line, if both features ship together**: don't allow an open return and an open warranty claim on the same order line at once — same check function gates both creation paths.
