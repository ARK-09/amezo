import { useReviewEligibilities } from '@/features/reviews/api/useReviews'
import { OrderLineReview } from '@/features/reviews/components/OrderLineReview'

import type { BuyerOrderLine } from '../api/useBuyerOrders'
import { SectionLabel } from './SectionLabel'

/**
 * The Reviews block inside an expanded delivered order: one card per product
 * bought, each idle, being written, or published.
 *
 * The eligibility answers are fetched here rather than inside each card so this
 * knows whether there is anything to head. Nothing renders while they are in
 * flight - a heading that then turned out to have no cards under it would be worse
 * than one that arrives a moment late.
 */
export function OrderReviews({ lines }: { lines: BuyerOrderLine[] }) {
  // One review per product is the server's rule - a second is a 409 - so two lines
  // of the same product get one card between them, not two that fight over it.
  const products = [...new Map(lines.map((line) => [line.productRef, line])).values()]
  const eligibility = useReviewEligibilities(products.map((line) => line.productRef))

  if (eligibility.some((query) => query.isPending)) return null

  // A product the server won't take a review for and hasn't got one is not a card:
  // an eligibility 401 (no buyer session) and NOT_PURCHASED both land here.
  const cards = products.flatMap((line, index) => {
    const answer = eligibility[index]?.data
    if (!answer) return []
    const existingReview = answer.existingReview ?? null
    if (!answer.eligible && !existingReview) return []
    return [{ line, existingReview }]
  })

  if (cards.length === 0) return null

  return (
    <>
      <div className="mt-[22px] mb-2.5">
        <SectionLabel>Reviews</SectionLabel>
      </div>
      <div className="flex flex-col gap-2.5">
        {cards.map(({ line, existingReview }) => (
          <OrderLineReview
            key={line.id}
            orderLineId={line.id}
            productTitle={line.productTitle}
            existingReview={existingReview}
          />
        ))}
      </div>
    </>
  )
}
