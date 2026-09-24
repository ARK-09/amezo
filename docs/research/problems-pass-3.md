# Buyer/seller problems on Amazon today (pass 3)

**About this pass:** This is the third independent pass. Pass 1 (`buyer-seller-problems.md`, Sonnet 5) covered counterfeits reaching buyers through pooled inventory, listing/variation hijacking that makes reviews untrustworthy, "marked delivered, not received" disputes, refunds issued before a return is inspected, and Buy Box opacity. Pass 2 (`buyer-seller-problems-opus5.md`, Opus 5) covered refunds reversed or never settled after on-time returns, Subscribe & Save price creep, soft recall notices, fake trademarks used for takedowns, and FBA fee overcharges from warehouse mis-measurement. Pass 2 also cut inflated "List Price" references and short FBA reimbursement windows. None of those, or close variants of them, appear below.

**The bar (unchanged):** Every problem must name a screen or flow where someone sees or does something, and a specific entity or field the system has to store that Amazon evidently does not store today. Each has a **Bar check** line that separates the policy half (not counted) from the product half (counted). All sources were fetched or searched in September 2026. Forum dates are given relative to that month.

**What's different this time:** Passes 1 and 2 landed mostly on money movement and enforcement. This pass looked at product data quality, post-purchase ownership, delivery, and buyer–seller communication, and weighted toward problems that hurt both sides. Four problems cleared the bar. They are ranked by strength. #1 and #2 are clearly two-sided. #3 is two-sided but sits next to an excluded problem, and this is flagged. #4 is two-sided but only matters if the MVP allows cross-border orders that sellers ship themselves.

---

### 1. The product page shows facts nobody owns, and the seller pays for the returns when they're wrong

**One-line:** Titles, specs, unit prices and AI-assistant answers that the selling seller didn't write (platform AI rewrites, auto-added attributes, normalized values, chatbot answers) are shown to buyers as plain fact. The buyer returns the item as "not as described" and the seller absorbs the return.

**Who it affects:** Both, strongly. Buyers purchase on a wrong spec: vehicle fit, voltage, pack count, allergens. Sellers see return spikes and account-health damage caused by content they can't see or edit.

**Why it happens:** Each field on an Amazon detail page is picked from competing sources, and neither the buyer nor the seller is shown which one won. A September 2026 catalog guide describes the mechanism: "Every attribute on a detail page is assembled from contributions" (the seller's, other sellers', vendor feeds, Amazon Retail, other marketplaces) ([SellerForge](https://www.sellerforge.ai/blog/amazon-catalog-hygiene-variations)). The platform is now also a major author:
- **AI rewrites.** Amazon's "Project Starfish" (an internal document reported by Business Insider) scrapes about 200,000 external brand websites and uses LLMs to rewrite titles, bullets and descriptions, with a projected $7.5B sales lift in 2025 ([Fox News summary of the BI report](https://www.foxnews.com/tech/amazons-ai-wants-own-online-shopping-data)). A seller-tools firm describes the seller's experience of it as "No notification. No approval. No warning." ([Seller Labs, Dec 2025](https://www.sellerlabs.com/blog/amazon-project-starfish-ai-listings/)). About three years ago a seller reported that Amazon changed their title and the new title caused "a spike in returns." Amazon's answer was to open a support case to restore the original ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/a9fa884e-03df-4624-bc91-dc8024db2a99)).
- **Machine-added attributes the seller can't edit.** One example: a 100-foot sewer hose displayed "120 inches" and a material of "Pearl, Polyester." The seller said "there's no way to edit this" ([Seller Forums, ~3 yrs ago](https://sellercentral.amazon.com/seller-forums/discussions/t/d6cd7d14-63c4-4acb-8f3d-ce98395abe5a)).
- **Derived values.** One listing showed "45 servings" and "$0.36 per unit" when the product actually had 90 servings at $0.18, so the product looked twice as expensive as it was. It took about 10 support cases to fix ([Seller Forums, ~3 yrs ago](https://sellercentral.amazon.com/seller-forums/discussions/t/3dae3a7f-e0a5-461e-8bea-2fb6ec583161)). Another seller: unit price "can't be edited by the seller" ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/a4b37ee6-e8f1-4a1d-ae15-5d69ed79da42)).
- **AI assistant answers.** Rufus told buyers that parts fit vehicles they didn't fit ("Amazon said it fit - but it doesn't"). It also said a component was 48V-only when it works "up to 48v systems." About seven months ago, Amazon staff replied that no opt-out exists and that an experiment would source compatibility answers "directly from Selling Partners" ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/ad79306c-37ca-4b4e-a995-4dd047fbb4cf)). In another case Rufus said a product "does not contain nuts" when it contained several kinds. It also raised product attributes that Amazon's own listing form doesn't ask for, so sellers can't answer them ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/cc689b94-696f-457f-bbc6-02bb9423e226)). Independent tests found it "confident but not more intelligent" ([Marketplace Pulse, Nov 2024](https://www.marketplacepulse.com/articles/amazons-shopping-ai-is-confidently-wrong)). Since May 13, 2026, its successor, Alexa for Shopping, is "embedded directly in the primary search bar" ([Stackline](https://www.stackline.com/news/rufus-is-gone-what-it-means-and-what-it-doesnt)). The browsable Q&A section, where buyers could read answers from sellers and other owners, had already been replaced by a search box ([EntreResource](https://entreresource.com/amazon-questions-answers/)). So AI answers are now the main pre-purchase channel, and they are not tied to any source the seller can see.
- **Off-Amazon listings too.** In "Buy for Me" (Jan 2026), merchants found listings of their products they never opted into, with "AI images of items that aren't mine" ([Value Added Resource](https://www.valueaddedresource.net/amazon-buy-for-me-small-business-backlash/)).

**Product surface:**
- **Product page (buyer):** Each spec row and claim shows its source: *seller*, *brand owner*, *generated by the platform from [source]*, or *not specified by the seller*. For fit, safety and allergen attributes, the assistant must cite the stored attribute it relied on. If no seller or brand value exists, it says "the seller hasn't specified this" instead of guessing.
- **Order page (buyer):** "What you were shown": a frozen copy of the attribute values and assistant answers the buyer saw before buying.
- **Return flow:** The reason "Product info was wrong" makes the buyer pick the specific claim from that frozen copy. The system assigns fault from that claim's source. A seller-written claim counts against the seller. A platform-written one is charged to the platform with no seller penalty, and the attribute is queued for correction.
- **Seller Central, "Listing content ledger":** For each field: the live value, who wrote it, and pending platform proposals to accept or reject. Brand owners can lock verified fields. A feed shows *questions buyers asked the assistant about this product that the catalog couldn't answer*, so the seller can fill the gap.

**What the system stores:**
- `attribute_value(id, product_id, attribute_key, value, unit, source_type: seller|brand_owner|platform_generated|other_contributor|normalizer, source_ref, status: proposed|live|rejected|superseded, created_at, superseded_at)`. The live value is a pointer to one row. Nothing is overwritten in place, so any displayed value can be traced to its author.
- `attribute_lock(product_id, attribute_key, locked_by, locked_at)`
- `derived_value(product_id, key, formula_version, input_attribute_value_ids[])`, for unit price, servings and similar. A wrong derived value traces back to the input that caused it.
- `assistant_answer(id, buyer_id, product_id, question, answer, cited_attribute_value_ids[], abstained, model_version, created_at)`. Today these answers evidently are not tied to anything a seller or dispute can see. That is why "Amazon said it fit" can't be checked.
- `order_line_claim_snapshot(order_line_id, attribute_value_ids[], assistant_answer_ids[])`
- `return_request.wrong_claim_ref` and `fault_party: seller|platform|buyer|carrier`, derived from the source of the claim the buyer picked. It is not a free-text reason.

**Not a repeat of pass 1 #2 (listing hijacking):** That problem was a *seller* swapping a listing's identity to keep its reviews, and its fix was a revision history. This one is about *who authored each claim* (often the platform) and who pays when it's wrong. It needs different entities: attribute provenance, an answer log, and return fault.

**Tension:** Labeling content "platform-generated" lowers buyer trust in content that is usually right. If the platform pays for its AI's mistakes, it will make the assistant abstain more and it becomes less useful. Brand locks let a bad-faith brand freeze inflated specs and block legitimate corrections. Amazon merges contributors in the first place because seller data is often wrong (the unit-price error above started as a seller setup mistake). Some sellers will also blame "the AI" for their own bad data. The frozen copy is what settles those disputes.

**Bar check:** "Don't rewrite listings without consent" and "the platform eats returns its AI causes" are policy and not counted. Counted: per-attribute provenance using pointers instead of overwrites, an order-time copy of the claims shown (including assistant answers), and a return reason tied to a specific claim so fault is computed, not argued.

---

### 2. Warranty coverage depends on who sold the item, but the product page is shared by every seller, so it can't say

**One-line:** Many brands honor their warranty only for units bought from authorized sellers. On Amazon, authorized and unauthorized sellers share one product page, and third-party sellers can't show warranty terms on it at all. Buyers pick the cheapest offer and find out they have no warranty when a claim is denied.

**Who it affects:** Both, strongly. Buyers lose coverage they reasonably assumed they had. Authorized sellers and brands take the 1-star reviews and support load for warranties that other sellers on the same listing didn't honor.

**Why it happens:** Amazon models the warranty on the product, but in practice the warranty belongs to the offer. Amazon staff said so directly: "Third party sellers are unable to add warranty information to detail pages since all sellers of a product may not be able to adhere to warranty specifics" ([Seller Forums, ~3 yrs ago](https://sellercentral.amazon.com/seller-forums/discussions/t/459ffaad-fb87-49a7-b0b5-6b2ee63a9856)). Meanwhile brands say coverage depends on the seller:
- Faber-Castell USA's Amazon page: "When purchasing from an unauthorized seller, any manufacturer warranty / guarantee is void" ([Faber-Castell](https://fabercastellusa.reamaze.com/kb/amazon-dot-com-online-shopping/amazon-dot-com-unauthorized-sales-void-manufacturer-warranty-slash-guarantee-717dbf1786df7c11)).
- Catalyst: third-party Amazon sellers "are not considered authorized resellers," so purchases "do not qualify" for its warranty ([Catalyst](https://catalystcase.com/pages/unauthorized-resellers)).
- On the seller side, an authorized seller got "a 1-star because one of the sellers never got back to them" about the brand's two-year warranty. They can't stop other sellers from joining the listing, and seller-specific information on the page is prohibited ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/c9d01ea494727d29d2a82ec3e9eb5084)).
- Federal warranty rules assume the buyer can see the terms that apply before buying. For products over $15 with a written warranty, the terms must be available before sale, online via a clearly labeled link near the product ([16 CFR 702.3](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-G/part-702/section-702.3)). A page shared by sellers with different coverage can't show "the terms that apply" to any one of them.

**Product surface:**
- **Offer list and featured-offer card:** A warranty line on each offer: "Manufacturer warranty, 2 yr (seller authorized by [Brand], verified)", "No manufacturer warranty: seller not authorized by [Brand]; seller warranty 90 days", or "Unknown". Plus a filter: "Only offers with manufacturer warranty."
- **Checkout:** If the chosen offer lacks coverage that another offer has: "$12 cheaper, but no manufacturer warranty."
- **Order page, "Warranty" card:** Who the warrantor is, a frozen copy of the terms, start and end dates, and a "Start warranty claim" button. The button routes to the warrantor (brand or seller) and keeps working after the seller leaves the platform. The card also shows claim status.
- **Brand console:** Publish warranty terms per product, manage the authorized-seller list, and see incoming claims.

**What the system stores:**
- `warranty_terms(id, warrantor_type: brand|seller|third_party, warrantor_id, product_id, duration_months, coverage_text, doc_url, version, effective_from)`
- `brand_authorization(brand_id, seller_id, scope, verified_at, expires_at, revoked_at)`
- `offer.warranty_terms_id` (nullable). **The warranty lives on the offer, not the product.** That one move is what Amazon's own staff said the current model can't do.
- `order_line_warranty(order_line_id, warranty_terms_id, starts_at, ends_at, warrantor_contact_snapshot)`
- `warranty_claim(id, order_line_warranty_id, opened_at, status, warrantor_response, resolved_at)`

**Tension:** A "no manufacturer warranty" label on resellers hands brands a lever. Authorized-dealer lists are also how brands police reseller pricing, and reselling genuine goods is legal. The label can work as a price floor controlled by the brand, and brands may curate their lists strategically. Authorization records also go stale: a lapsed list wrongly marks a legitimate reseller as "no warranty." Honest resellers may respond by offering their own warranties, which buyers then have to compare.

**Bar check:** Whether brands may void warranties based on where the item was bought, and whether the platform should allow unauthorized resellers at all, is policy and not counted. Counted: moving the warranty from product to offer, a verified brand→seller authorization record, and an order-line warranty record with a claim flow.

---

### 3. Saved delivery instructions silently don't apply when a third-party seller ships the order

**One-line:** A buyer saves a gate code or "leave with the concierge" once and assumes it applies everywhere. On orders a third-party seller ships (instead of Amazon), the instructions never reach the carrier, and the seller mostly never sees them.

**Who it affects:** Both. Buyers get failed deliveries and packages left outside secured buildings. Sellers get the not-received claims, and the platform's own claim protection pushes them to ignore the instructions.

**Why it happens:** The instructions are stored on the address and used by Amazon's own delivery drivers. Nothing records whether they were delivered with a given shipment. About six months ago, Amazon staff confirmed that delivery instructions "are visible in order reports but aren't automatically passed to carriers for seller-fulfilled orders". The feature is "primarily designed for Amazon Logistics." Staff also advised sellers to ship exactly as the label shows to keep their protection when they buy the shipping label through Amazon ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/97806057-148d-42bb-a6d3-1e1b8d4c3c9d)). In one case, a seller shipped sandals to a high-rise. The buyer's instructions for getting into the building never reached the seller, and the package was left at the street door and disappeared. A reply noted a buyer "would definitely assume they apply to all orders, and would be wrong" ([Seller Forums, 2021](https://sellercentral.amazon.com/seller-forums/discussions/t/2e2358f8aa351db02be442f3e223cb9d)). Sellers have reported buyers citing instructions the sellers couldn't find on the order page or packing slip, including a "UPS/FedEx only" request that ended "Delivered, To Agent" at another address ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/1031c63efc44d13d28ef98f106065753)).

**Product surface:**
- **Checkout, for each shipment:** "✓ Your delivery instructions will reach the driver" or "✗ This seller ships via FedEx, so your saved instructions won't reach the driver." Options: add them for this order, message the seller, or pick another offer.
- **Seller order page, packing slip and label:** Instructions appear on the order itself, not only in a downloadable report. When the label is bought through the platform, structured fields (access code, drop location) go into the carrier's instruction field wherever the carrier supports it.
- **Claim view:** Shows whether instructions were sent for this shipment and whether the carrier acknowledged them. This is an input for the not-received decision.

**What the system stores:**
- `delivery_instruction(id, address_id, version, access_code_encrypted, drop_location, free_text, created_at)`. Instructions are versioned, so a claim can reference exactly which version applied.
- `carrier_capability(carrier_id, supports_access_code, supports_free_text, max_len)`
- `shipment_instruction_delivery(shipment_id, delivery_instruction_version_id, channel: carrier_api|label_field|seller_view_only|not_sent, sent_at, carrier_ack_at, truncated)`. Today there is evidently no record per shipment. The instructions are simply attached to the address.
- A computed `instructions_will_reach_driver` flag at checkout, from the offer's shipping method and `carrier_capability`.

**Adjacency, flagged honestly:** Pass 1 #3 ("marked delivered, not received") shares the downstream symptom. That problem was about *post-delivery evidence* (scan, GPS, photo). This one is an *upstream information loss* between buyer, seller and carrier, with a different screen (checkout, label) and a different entity (sending instructions per shipment). If you judge it a close variant, drop it. Problems #1 and #2 don't depend on it.

**Tension:** Gate and lockbox codes are sensitive. Sending them to every third-party seller and carrier widens the exposure, so the codes need to be structured, encrypted and shown only when necessary. Free-text instructions are also a fraud vector ("deliver to my agent at…"). And sellers who follow instructions that differ from the label risk losing their claim protection, which is a policy conflict the product alone can't fix.

**Bar check:** Whether sellers stay protected when they follow buyer instructions is claim policy and not counted. Counted: versioned instructions, a per-shipment record of whether they were sent, and the checkout indicator saying whether they'll reach the driver.

---

### 4. Cross-border orders shipped by sellers: who pays import duties isn't recorded, and "held at customs" isn't a tracking state

**One-line:** On international orders that sellers ship themselves, the buyer is responsible for duties, but the checkout doesn't reliably show them. The buyer gets a duty bill plus a carrier fee at the door, refuses or ignores customs, and files a not-received claim. The claim is granted because the tracking can't express "waiting on the buyer at customs."

**Who it affects:** Both, but with **narrow scope**: only relevant if the MVP lets sellers ship across borders themselves. Buyers get surprise charges. Sellers lose the item, the shipping cost and the claim.

**Why it happens:** The order doesn't store who owes duties or what the buyer agreed to, and tracking has no customs state. Amazon staff state that on amazon.com international orders "buyers are responsible for any applicable import taxes, fees, and customs duties". Sellers in that thread say Seller Support is "also confused about this policy". They report being charged duties anyway and having to fully refund buyers who refused to pay at delivery ([Seller Forums, ~2 yrs ago](https://sellercentral.amazon.com/seller-forums/discussions/t/ba105e36-00b4-49ae-9729-4e55e3820a5f); [related thread](https://sellercentral.amazon.com/seller-forums/discussions/t/fda9a13f-253d-4f43-9dbc-214c1e4741aa)). In one case (Italy→Argentina, ~1 yr ago), a package sat in customs from June 24. The buyer had agreed in writing, over buyer–seller messaging, to pay local duties. Amazon still granted the not-received claim without asking for documents and rejected the appeal ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/437ea89c-5d16-4e76-9f62-6f8c6bec8f4d)). In another (Canada→Mexico via FedEx, ~1 yr ago), buyers didn't provide the tax ID customs required. The system marked the claim as "invalid tracking," and buyers cleared the package after being refunded, keeping both the refund and the item ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/303685c7-bc0e-4c9a-9355-7c2c584271fc)). On the buyer side, the problem got broader when the US ended the $800 duty-free threshold on Aug 29, 2025. NBC reported bills such as $1,400 on a $750 part, and a buyer charged about $50 for return shipping after refusing delivery. That reporting covers online orders generally, **not Amazon specifically** ([NBC News, Sep 2025](https://www.nbcnews.com/business/consumer/surprise-tariff-bills-de-minimis-rcna229375)).

**Product surface:**
- **Offer and checkout:** "Import duties & taxes: included" or "Not included: est. $X duties + ~$Y carrier fee, payable to [carrier] on delivery", with the ship-from country and an explicit acknowledgment from the buyer.
- **Order tracking:** "Held at customs. Action needed from **you**: pay $X / provide tax ID by [date]." This is a real state with an owner and a deadline, not a delay.
- **Claim flow:** While the latest shipment state is a customs hold waiting on the buyer, a not-received claim is paused, not auto-granted. "Refused at customs" closes as a refused delivery, not a non-delivery.
- **Seller:** Set duty terms per offer and destination, and see a queue of customs holds.

**What the system stores:**
- `offer_trade_terms(offer_id, destination_country, incoterm: DDP|DAP, ship_from_country)` (DDP means the seller pays duties; DAP means the buyer does)
- `order_line_duties_snapshot(order_line_id, incoterm, est_duties, est_carrier_fee, acknowledged_at)`. Today that agreement evidently lives in free-text messages, as in the Italy case.
- `shipment_event.type` extended with `customs_hold|customs_released|refused_by_consignee`, plus `action_owner: buyer|seller|carrier` and `action_due_at`.
- `claim.blocked_by_event_id`, so a claim decision references the customs state instead of reading it as "invalid tracking."

**Tension:** Pausing claims during customs holds lets bad sellers stall by choosing buyer-pays terms and letting the parcel sit. Duty estimates are often wrong, and a wrong estimate shown at checkout creates its own disputes. The buyer-friendly answer is seller-pays for everything, but that pushes small sellers to register as importers or hire brokers, or to stop shipping internationally. Many already have.

**Bar check:** Who *should* pay duties (for example, requiring the seller to pay) is policy and not counted. Counted: duty terms stored per offer and acknowledged at checkout, and a customs-hold tracking state with an action owner that the claim flow reads.

---

## Pattern across the four (for the data model)

All four fail because **the thing the buyer relied on isn't stored with who stands behind it**: a spec without an author (#1), a warranty on the product instead of the offer (#2), instructions on an address with no record of whether they were sent (#3), duty terms agreed in a chat message (#4). The MVP rule that follows: any promise shown to a buyer before purchase (spec, answer, warranty, delivery handling, landed cost) is stored as a row with a source, attached to the **offer or shipment** that makes it, and copied onto the order line at purchase. Disputes then reference that copy.

## Rejected

- **Search results padded with irrelevant "junk" ads.** Real and sourced: the FTC alleges Amazon accepted ads it internally labeled "defects" ([Bloomberg, Nov 2023](https://www.bloomberg.com/news/articles/2023-11-02/amazon-boosted-junk-ads-hid-messages-with-signal-ftc-says); [FTC v. Amazon](https://en.wikipedia.org/wiki/FTC_v._Amazon)). Cut because the fix is ad load and relevance thresholds, which is policy with no new entity.
- **Search shows a cheap unrelated variant's price for an expensive item** ([rather-be-shopping](https://www.rather-be-shopping.com/blog/amazon-bait-switch-pricing-scam/)). Close variant of pass 1 #2 (unrelated items folded into variation families) and of the excluded misleading-price-display problem.
- **Smart devices with no disclosed software-support period.** 89% of manufacturer pages were silent ([FTC, Nov 2024](https://www.ftc.gov/news-events/news/press-releases/2024/11/smart-products-surveyed-fail-provide-consumers-information-how-long-companies-will-provide-software)). The FTC surveyed manufacturer sites, not marketplaces, and I couldn't source a failure specific to Amazon's marketplace. It also affects buyers only.
- **Security flaws and firmware fixes that never reach past buyers.** Eken/Tuck doorbells sold on Amazon carried "Amazon's Choice" badges even after Consumer Reports flagged the flaws ([CR, Feb 2024](https://www.consumerreports.org/media-room/press-releases/2024/02/consumer-reports-investigation-finds-video-doorbells-sold-on-amazon-walmart-temu-and-other-digital-marketplaces-have-serious-security-flaws)). The fix (a persistent notice on past buyers' order pages) is a close variant of pass 2 #8 (recalls).
- **Heavy/bulky delivery scheduling with masked buyer phone numbers** ([Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/06ca092e0d1c6a3b7cecc0637544843f)). Amazon already offers Arranged Freight Delivery and Scheduled Delivery templates. What's left is minor, such as the extension not fitting a UPS label field.
- **Buyer–seller messaging bans on links and videos** ([Seller Labs](https://www.sellerlabs.com/knowledge-base/buyer-seller-messaging-rules-what-you-can-and-cant-send/)). Mostly anti-spam policy. Instructions and warranty PDFs are already allowed as attachments.
- **FBA items returned as "defective" when the buyer only needed setup help.** Overlaps the excluded return problems (pass 1 #4, pass 2 #6), and the sourcing was generic.
- **Warranty orphaned when a seller is banned (e.g., the 2021 Aukey/RAVPower removals).** Couldn't source concrete buyer harm. The order-line warranty record in #2 covers it anyway.
- **AI "Customers say" review summaries that misrepresent the reviews** (one seller reported a 75% sales drop; [Seller Forums](https://sellercentral.amazon.com/seller-forums/discussions/t/c6b71d97-2a61-479d-a8ab-16b103aac546)). Merged into #1. It's the same fix (generated text must cite its source records), and a separate entry would be padding.
- **Rufus/assistant errors and unit-price errors as separate problems.** Merged into #1 for the same reason: same root cause, same schema.
- **Import duties specifically for US buyers after the end of the $800 duty-free threshold.** Couldn't find reporting specific to Amazon (most China-based sellers import in bulk through FBA). What survives is the narrower cross-border case in #4.

## What didn't work

*(fill in)*
