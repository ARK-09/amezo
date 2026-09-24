# Buyer/seller problems on Amazon today (Opus 5 pass)

**About this pass:** Independent research, done after the Sonnet 5 pass (`buyer-seller-problems.md`, kept for comparison). Same bar: every fix must be something a user sees or does in the product (a screen, a flow) plus state the system must store. "We just won't do what Amazon does" does not count. None of the five below repeats a Sonnet 5 problem. Each one has a **Bar check** line that separates the policy half of the problem (not counted) from the product half (counted). All sources were fetched in September 2026.

## Buyer-side

### 1. Returned on time, refunded, then charged again, and the buyer finds out from their bank statement

**One-line:** A buyer drops off a return and gets an "advance" refund. Later the refund is reversed, or it never actually settled, because the warehouse lost, missorted or misgraded the return. The buyer sees no step-by-step record they could use to dispute it.

**Who it affects:** Buyers who return items, potentially millions of them. The class covers refunds that were "missing, late, incorrect or reversed" going back to September 2017.

**Why it happens:** The refund fires on the carrier's first scan, but the final decision waits until the warehouse matches the physical item to the return. When that match fails (lost in transit, missorted, graded wrong), the system reverses the refund or charges the buyer, and nothing shows the buyer which step broke. Amazon's own explanation after a 2025 internal review: it had "issued a refund without the payment completing, or where we could not verify that the correct item had been sent back to us, so no refund had been issued." Plaintiffs said they caught the recharges on their card statements. The judge who denied Amazon's motion to dismiss wrote that plaintiffs "adequately alleged that Amazon stole money directly from their bank accounts." Settlement: $309.5M cash, about $570M in refunds already reissued, and more than $363M in non-monetary relief that explicitly includes "transparency on refund status." It was preliminarily approved on Aug 18, 2026, with the final hearing set for Mar 16, 2027.

**Source:** [TechCrunch: Amazon agrees to pay consumers $309M in returns policy settlement (Jan 2026)](https://techcrunch.com/2026/01/27/amazon-agrees-to-pay-consumers-309m-in-returns-policy-settlement/); [OpenClassActions: In re Amazon Return Policy Litigation, No. 2:23-cv-01372-JNW, W.D. Wash.](https://openclassactions.com/settlements/new-amazon-returns-class-action-settlement.php); [NBC Chicago: class action accuses Amazon of failed refunds](https://www.nbcchicago.com/news/local/class-action-lawsuit-accuses-amazon-of-failed-refunds-who-could-qualify/3749019/); [ClassAction.org: $309.5M settlement, alleged mechanisms (lost in transit, missorting, grading errors, improper recharges)](https://www.classaction.org/news/amazon-to-pay-309.5m-to-end-class-action-lawsuit-over-return-policies).

**Product surface:** A **Return & refund timeline** on the order line that shows each custody step as it happens: label created → dropped off (carrier receipt, location, time, downloadable) → in transit → received at facility → item matched (or mismatch, with photo and reason) → refund issued → **refund settled** (payment processor confirmed). A backward step, such as a reversal or a charge for "item not received," appears as a timeline event with its reason and evidence. It also has a **"Dispute before charge"** button that stays open for a fixed notice window before any money leaves the buyer's account. A buyer never has to learn about a reversal from a bank statement.

**What the system stores:**
- `return_request(id, order_line_id, reason, created_at, status)`
- `return_custody_event(id, return_request_id, type: label_created|dropped_off|carrier_scan|received|graded|mismatch, occurred_at, location, actor, evidence_url)`
- `refund(id, return_request_id, amount, status: pending|issued|settled|failed|reversed, processor_ref, issued_at, settled_at)`. `issued` and `settled` must be separate states, because Amazon's own failure was "issued a refund without the payment completing."
- `refund_reversal(id, refund_id, reason_code, evidence_event_id, notice_sent_at, charge_scheduled_at, disputed, outcome)`
- A reconciler job flags any return that has a `received` custody event but no `settled` refund after N days. The settlement's "automatic refund re-processing" is that job.

**Tension:** Refunding at first scan is what makes this buyer-friendly, and sellers hate it. On the Seller Central forums, sellers say they get back empty boxes and wrong items after a full refund, with no way to opt out ("we don't really know what's in the box until WE RECEIVE IT AND INSPECT IT"; [Seller Forums: Why is Amazon Refunding at First Scan](https://sellercentral.amazon.com/seller-forums/discussions/t/0190c381-9fb7-494a-9eda-8e065000ed7e)). Requiring evidence and advance notice before any reversal protects honest buyers, but it also makes it slower to claw back money from real empty-box fraud. This is the direct mirror of Sonnet's seller-side problem #4. The custody log only helps up to the carrier scan: a scan proves a box was handed over, not what was inside it.

**Bar check:** How generous the refund timing is (first scan vs. inspection) is policy and not counted. The product fix is the refund state machine with a separate `settled` state, a custody log the buyer can see, and reversals that need evidence and advance notice.

### 2. Subscribe & Save price creeps up after enrollment, and the notice arrives the night of the charge

**One-line:** A buyer enrolls in a recurring subscription at a discounted price. The price is re-evaluated at every shipment, so the subscription can end up costing more than other sellers charge for the same item on the same site, and the buyer is told when the order is charged.

**Who it affects:** Buyers with recurring subscriptions to consumables (coffee, diapers, supplements), which by design are purchases people stop paying attention to.

**Why it happens:** The subscription stores a cadence, not a price. Each cycle is charged at whatever the current price is minus the subscription discount, and the terms say Amazon "may change the price for a Subscribe & Save subscription at any time for any reason." In *Herman v. Amazon.com* (W.D. Wash. No. 2:26-cv-01674, filed May 15, 2026), plaintiffs enrolled in Feb 2024 at $16.60 for Lavazza espresso. By Oct 2024 each shipment cost $28.69, while another seller on Amazon offered the same product for $25.90. The email about the last increase "arrived at 8:54 p.m. the same night the order was processed and charged." Amazon's position is that subscribers get price-change emails before each order and can skip or cancel. The dispute is about timing and consent, not whether a notice exists.

**Source:** [Top Class Actions: Amazon faces class action over allegedly deceptive Subscribe & Save pricing](https://topclassactions.com/lawsuit-settlements/lawsuit-news/amazon-faces-class-action-over-allegedly-deceptive-subscribe-save-pricing-practices/); [Yahoo Finance: Amazon accused of tricking millions of shoppers (Jun 2026), which covers the 8:54 p.m. email, the $25.90 competitor price, and the fine-print price clause](https://finance.yahoo.com/markets/stocks/articles/amazon-accused-tricking-millions-shoppers-153119239.html); [Class Action U: price timeline ($19.53 one-time vs. $16.60 subscribed at enrollment; $28.69 vs. $25.90 in Oct 2024)](https://classactionu.org/our-news/amazon-facing-class-action-lawsuit-over-subscribe-and-save-bait-and-switch-pricing/).

**Product surface:** At enrollment, the buyer sets a **price ceiling**: "ship automatically up to $X (or up to +10%), otherwise ask me." The **subscription dashboard** shows three numbers per subscription: the enrolled price, the next shipment's quoted price, and the cheapest current offer for the same product from any seller. If the quote is over the ceiling, the cycle moves to **"Awaiting your approval"** with a deadline some hours before the charge. If the buyer doesn't respond, the cycle is skipped, not shipped.

**What the system stores:**
- `subscription(id, buyer_id, product_id, offer_id, cadence_days, enrolled_unit_price, price_ceiling, ceiling_type: absolute|percent, status, next_ship_on)`
- `subscription_cycle(id, subscription_id, quoted_unit_price, quoted_at, lowest_alt_offer_price, notice_sent_at, approval_deadline, decision: auto_within_ceiling|approved|skipped|expired, charged_price, charged_at)`
- Each cycle keeps a snapshot of its quote, so "notified before charge" becomes a rule the system can check: `notice_sent_at < approval_deadline < charged_at`. Otherwise it is only a claim in the terms of service.

**Tension:** Sellers offer subscriptions for predictable demand. With a ceiling and an approval gate, any real cost increase (a supplier price rise, tariffs) turns into many cycles stuck at "awaiting approval," then skipped shipments and churn. Sellers will likely respond by setting a higher enrollment price to leave headroom, or by dropping the subscription discount, which makes the buyer's starting price worse. Showing the cheapest competing offer on the subscription page also actively sends a seller's subscribers to rival sellers.

**Bar check:** "Don't raise prices on subscribers" is policy and not counted. The product fix is the ceiling the buyer sets at enrollment, a price quote saved for each cycle with a notice timestamp, and the approve/skip state.

### 3. Hazardous products sold by third-party sellers: the recall notice is soft, it lives only in email, and it never reaches gift recipients

**One-line:** When a product sold by a third-party seller turns out to be dangerous, buyers get a softened email instead of a recall. Nothing persistent appears on the order, the remedy is a gift card that doesn't require proof of disposal, and people who received the item as a gift never hear about it.

**Who it affects:** Buyers of hazardous products, and anyone who received those products second-hand. Also the sellers who sold them.

**Why it happens:** Recalls on a marketplace fall between the platform and the seller, and the order record often cannot say exactly which product and seller a buyer received. In July 2024 the U.S. Consumer Product Safety Commission (CPSC) ruled unanimously that Amazon is a "distributor" of Fulfilled-by-Amazon products. The ruling covered more than 400,000 units, sold 2018–2021, of carbon monoxide detectors that fail to alarm, hair dryers without protection against electrocution in water, and children's sleepwear that fails flammability standards. The CPSC found that Amazon's 2021 notices "downplayed the severity," saying products "may fail" standards and "potentially" posed risks. The notices never used the word "recall" (the subject line was "Important safety notice about your past Amazon order"), and they offered gift cards without verifying that products were destroyed. The final order (Jan 17, 2025) requires: posting to Amazon's "Recalls and Product Safety Alerts" page, direct email to purchasers, a notice **on each purchaser's "Your Orders" page**, a full refund **on proof of destruction**, one round of notice to the FBA sellers involved, a five-year retention period, and monthly reports. Amazon sued the CPSC in March 2025 (D. Md.) to contest its status as a distributor. That is a fight over who is legally obliged. Buyers need the product capability either way.

**Source:** [CPSC: final order to Amazon.com outlining remediation (Jan 2025)](https://www.cpsc.gov/Newsroom/News-Releases/2025/CPSC-Issues-Final-Order-to-Amazon-com-Outlining-Remediation-Plans-for-Hazardous-Products); [Consumer Federation of America: order requirements (refund on proof of destruction, 5-year retention)](https://consumerfed.org/press_release/cpsc-issues-decision-and-order-on-fulfilled-by-amazon-products/); [LegalExaminer: Amazon's 2021 notices "downplayed the severity," no "recall," gift cards without proof](https://www.legalexaminer.com/lestaffer/home-family/amazon-held-accountable-for-dangerous-products/); [AboutLawsuits: "Your Orders" page and email requirements](https://www.aboutlawsuits.com/cpsc-orders-amazon-warn-consumers-hazardous-products-on-website/); [US News: Amazon sues CPSC over recall order (Mar 2025)](https://www.usnews.com/news/business/articles/2025-03-19/amazon-sues-consumer-product-safety-commission-over-recall-order-for-hazardous-products).

**Product surface:**
- **A recall banner on the order line in order history.** It stays there instead of arriving as a one-off email, uses the word "Recall," names the hazard, and says "stop using."
- **A remedy flow:** the buyer uploads a photo of the destroyed or disabled product and gets a refund to the original payment method, not a gift card, with a visible status.
- **A recall banner on the product page and a public recall page**, for gift recipients and second-hand owners who have no order.
- **On the seller side:** a recall flag on the affected listings and a list of the affected orders.

**What the system stores:**
- Order lines must point to a canonical `product(id, gtin, brand, model_number)` plus the fulfilling `seller_id`, and a lot where one is known, not only to a free-text listing. Otherwise the system cannot answer "who bought the recalled thing."
- `recall(id, source: regulator|manufacturer|platform, product_id, lot_range, hazard_text, remedy_type, announced_at, regulator_ref)`
- `recall_affected_line(recall_id, order_line_id, match_basis: lot|seller|product)`
- `recall_notice(id, recall_id, buyer_id, channel: email|order_page|push, sent_at, first_viewed_at)`. This record is also the evidence for regulator reporting.
- `recall_remedy_claim(id, recall_id, order_line_id, proof_photo_url, status, refund_id, reviewed_at)`
- Retention of at least 5 years.

**Tension:** It comes down to how precisely the system can match a recall to orders. If the system can only match at listing level (several sellers or manufacturers share one listing), a recall of one seller's bad batch flags every buyer of that listing and charges back every seller on it. Buyers get alert fatigue and innocent sellers get punished. Matching precisely means capturing seller and lot identity for every unit at intake, which is extra onboarding work for every seller. Separately, if the platform funds the refund and debits the seller, a small seller whose supplier caused the defect can be wiped out by one recall.

**Bar check:** "Take responsibility as a distributor" is policy and not counted. The product fix is a recall state that stays on the order line, a refund that requires proof, and product identity on every order line so affected buyers can be found at all.

## Seller-side

### 4. Competitors use fake or lapsed trademarks to get rival listings taken down, and the accused seller sees a takedown notice, not the evidence

**One-line:** A competitor holding an invalid or cancelled trademark (or a throwaway website of scraped images posing as a "copyright") files an infringement notice. The rival's listing comes down immediately, and the accused seller has to chase a retraction without seeing what the claim rests on.

**Who it affects:** Third-party sellers in crowded categories, whose listings get knocked offline, often at peak season. Real brand owners are affected too, because their legitimate complaints sit in a system full of abuse.

**Why it happens:** Complaints are handled notice-and-takedown: a complaint that is valid in form triggers removal before anyone checks it. A seller-side consultancy puts it bluntly: "Amazon doesn't typically investigate the validity of infringement claims and takes action immediately." Complainants often use Gmail or Yahoo addresses or fake law-firm names, and an IP claim "will hang over your seller account for six months before it vanishes, even if it was bogus." Amazon's own lawsuits document the scale. In March 2023 it sued three groups: **Sidesk (~3,850 takedown requests)**, Dhuog (229) and Vivcic (59). They used disposable websites filled with images scraped from Amazon, and Sidesk entered Brand Registry with a trademark application **the USPTO had already cancelled**. In September 2024 (updated Nov 2025), Amazon sued defendants who obtained invalid USPTO registrations, used them to enter Brand Registry, and filed false notices against competitors. An attorney was sanctioned by the USPTO.

**Source:** [MobileSyrup: Amazon takes legal action against illegitimate copyright complaints (Mar 2023)](https://mobilesyrup.com/2023/03/31/amazon-takes-legal-action-against-illegitimate-copyright-complaints/); [About Amazon: Counterfeit Crimes Unit, lawsuit against invalid trademarks and fake complaints (Sep 2024, updated Nov 2025)](https://www.aboutamazon.com/news/policy-news-views/amazon-counterfeit-crimes-unit-latest-updates-2024?p=a-new-lawsuit-targets-bad-actors-who-obtained-invalid-trademarks-or-filed-fake-complaints-in-an-effort-to-remove-products-from-the-amazon-store); [PYMNTS: Amazon files lawsuit targeting allegedly false trademark infringement notices (Sep 2024)](https://www.pymnts.com/amazon/2024/amazon-files-lawsuit-targeting-allegedly-false-trademark-infringement-notices/); [Riverbend Consulting: Amazon fake intellectual property claims](https://riverbendconsulting.com/blog/fake-intellectual-property-claims/).

**Product surface:**
- **Complainant side:** a structured intake form. The complainant picks from *their own verified rights*; there is no free-text trademark. They choose a claim type, point at the exact infringing element (logo, image, product), and attach evidence. A counterfeit claim requires a test-buy order ID from the platform itself.
- **Accused seller side:** a **complaint detail screen** showing the complainant's verified business entity, the right asserted with its registration number and *current* registry status, the specific evidence, and a **counter-notice form** for uploading invoices. A status timeline runs filed → listing restricted → counter-notice → decision.
- **The complainant's record** (filed, upheld, overturned, retracted) is visible to reviewers.

**What the system stores:**
- `ip_right(id, owner_account_id, right_type: trademark|copyright|patent|design, registration_number, jurisdiction, registry_status, last_verified_at)`. `registry_status` and `last_verified_at` exist because Sidesk used an application that was already cancelled: checking once at enrollment is not enough, rights must be re-checked.
- `ip_complaint(id, complainant_account_id, ip_right_id, accused_seller_id, listing_id, claim_type, infringing_elements[], evidence[], test_buy_order_id, status, filed_at, decided_at, outcome)`. `test_buy_order_id` is a foreign key to a real order, so the system can check it instead of trusting a screenshot.
- `counter_notice(id, ip_complaint_id, submitted_by, basis, documents[], submitted_at)`
- `listing_restriction(id, listing_id, cause_type, cause_id, started_at, lifted_at)`. Every takedown traces to the complaint that caused it.
- `complainant_record` (a view over `ip_complaint`): counts of filed, upheld, overturned and retracted complaints.

**Tension:** Buyers want counterfeits gone now. Any verification step or counter-notice window between complaint and takedown keeps a *real* counterfeit on sale longer, and counterfeiters will file counter-notices too, just to buy time. Requiring a test-buy for counterfeit claims also taxes small legitimate brands, who would have to buy from every knockoff seller to file. Instant takedown is exactly what makes the tool easy to weaponize. The product can move the tradeoff, but it can't remove it.

**Bar check:** "Don't auto-remove on complaint" is policy and not counted. The product fix is a complaint tied to a verified, re-checked right, evidence the accused seller can see, a counter-notice state machine, and complainant track records.

### 5. The warehouse mis-measures a product, the fee tier jumps, and past overcharges aren't refunded because the fee was "correctly calculated" from the wrong measurement

**One-line:** A warehouse scanner measures a squashed poly bag or a unit with a bulging label, and the product jumps a size tier. Every unit then ships at a higher fulfillment fee, nothing alerts the seller, and after a remeasurement fixes the dimensions, fees already charged stay charged.

**Who it affects:** Sellers who use Amazon's fulfillment service (FBA), especially those with products near a size-tier boundary.

**Why it happens:** Warehouses periodically re-measure units with Cubiscan machines, and the fee tier is assigned automatically from whatever the machine recorded. There is no notification: "Nothing tells you. The number that changes is a fee on a transaction line." Sellers typically find out 60–120 days later. On the 2026 rate card, crossing from Large Standard to Large Bulky adds $8–12 per unit. "Amazon does not automatically refund fees charged on a dimension it later corrects"; the seller has to request the remeasurement and then, separately, the reimbursement, within a window of about 90 days. Remeasurement requests are also rationed: a product is ineligible if it was remeasured twice in 60 days or has no units in stock, and accounts have a monthly cap. One seller's fee went from $40.43 to $88.93 per order, $1,392 over 29 orders. Amazon fixed the dimensions but refused the refund because "The $88.93 fee was correctly calculated based on the (incorrect) measurements at that time."

**Source:** [Seller Forums: "Amazon made a measurement error, corrected it, but refuses to refund overcharged FBA fees"](https://sellercentral.amazon.com/seller-forums/discussions/t/fe4a0969-6e01-4991-946c-ccd033080e80); [Velocity Sellers: The True Cost of an FBA Remeasurement (Sep 2026)](https://www.velocitysellers.com/2026/09/06/amazon-fba-remeasurement-fee-overcharge-cost-data-deep-dive-2026/); [Clawback: FBA fee overcharges from one bad remeasurement](https://clawbackfba.com/blog/fba-fee-overcharge-remeasurement); [Seller Forums: "FBA re-measurement dimensions is incorrect for over 4 months"](https://sellercentral.amazon.com/seller-forums/discussions/t/e21ea192-bdca-4012-b66f-2ccfeac10819).

**Product surface:**
- **A per-product "Measurements" panel** showing the seller's declared dimensions next to every warehouse measurement (date, facility, device, photo), with the measurement currently driving the fee tier highlighted.
- **A tier-change alert** the moment a new measurement moves the tier: "New measurement puts this SKU in Large Bulky: fee $7.10 → $16.90 per unit. Dispute?"
- **Dispute → remeasure → decision.** If the dispute is upheld, the screen lists every fee charged under the bad measurement and the credit is issued automatically. The seller never files a second claim.

**What the system stores:**
- `package_measurement(id, sku_id, source: seller_declared|warehouse, length, width, height, weight, facility_id, device_id, photo_url, measured_at, status: active|superseded|disputed|invalidated)`
- `sku_fee_basis(sku_id, measurement_id, size_tier, effective_from, effective_to)`
- `fee_charge(id, order_line_id, fee_type, size_tier, measurement_id, rate_card_version, amount)`. **Every fee records the measurement it was computed from.**
- `measurement_dispute(id, measurement_id, opened_at, remeasure_measurement_id, outcome, credit_total)`
- With `measurement_id` on every fee, invalidating a measurement is a single query that returns the exact credit owed. "Correctly calculated under the wrong dimensions" stops being a defensible answer, because each charge is stored as derived from an input that was marked invalid.

**Tension:** This one is mostly seller vs. platform, with only an indirect buyer effect, and I'm flagging that honestly. If fees fall back to the seller's declared dimensions while a dispute is open, sellers who under-declare get a free ride. Carriers bill on real size, so the platform absorbs the gap and eventually spreads it across everyone's fees and prices. Tier alerts and measurement photos also show sellers exactly how close to a boundary they sit, which invites over-compressed packaging (vacuum-packed poly bags that spring back), and that means more damage and returns for buyers. Photo-backed remeasurement on demand also costs warehouse labor for every dispute.

**Bar check:** "Refund overcharges" is policy and not counted. The product fix is measurement history the seller can see, a tier-change alert, and a fee ledger in which every charge references the measurement it came from, so credits can be computed automatically.

## Pattern across the five (for the data model)

Three of the five (#1 refund, #2 subscription charge, #5 fee) fail for the same schema reason. **A money movement is stored as an amount, not as a result derived from a specific input**: a custody event, a price quote, a measurement. When the input is wrong or disputed, nothing links the money back to it, so nobody can recompute it and the buyer or seller has no evidence to argue with. For the MVP: every `refund`, `charge` and `fee` row should carry a foreign key to the snapshot it was computed from. The other two (#3 recall, #4 IP) fail because **identity is too coarse**: an order line that knows only a listing, not a canonical product, seller and lot, and a right that was verified once and never re-checked.

## Considered and cut

- **Inflated "List Price"/"Was" strikethrough reference prices.** This is well documented: a [$2M settlement with California DAs in 2021](https://www.courthousenews.com/amazon-settles-2-million-reference-pricing-consumer-protection-suit/) and a [2024 class action over Fire TV list prices](https://www.kiro7.com/news/local/class-action-lawsuit-claims-amazon-misled-consumers-with-fake-discounts/CY6QCIW4TBE7XI7VKAUTQUYZDI/). Cut because Amazon already ships a [30/90/365-day price-history chart on product pages](https://www.aboutamazon.com/news/retail/how-to-check-amazon-price-history). What remains is the rule for when a reference price is valid, which is a legal and policy question, not a new screen.
- **Short windows for FBA lost/damaged-inventory claims.** Since Mar 31, 2025, reimbursement is at manufacturing cost with a 60-day filing window, down from 18 months ([eComEngine](https://www.ecomengine.com/blog/fba-reimbursement-policy)). There is a product half (a unit-level inventory ledger that opens claims automatically), but most of the pain is policy (the reimbursement basis and the window), and its data-model lesson is the same as #5's. #5 was kept as the sharper, more specific example.

## What didn't work

*(fill in)*
