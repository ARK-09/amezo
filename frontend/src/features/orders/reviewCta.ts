/**
 * The four labels the design gives the review button on an order card, which
 * depend on how much of that order has been reviewed already.
 *
 * `knowsEveryLine` is the honest part: the list serves a preview of an order's
 * lines, not all of them, so a card showing two of five products cannot claim the
 * order is fully reviewed. It settles for "Finish your reviews" rather than
 * promising "Your review" about lines it has never seen.
 */
export function reviewCtaLabel({
  reviewed,
  reviewable,
  hasSeveralItems,
  knowsEveryLine,
}: {
  reviewed: number
  reviewable: number
  hasSeveralItems: boolean
  knowsEveryLine: boolean
}): string {
  if (reviewed === 0) return hasSeveralItems ? 'Review these items' : 'Write a review'
  if (reviewed < reviewable || !knowsEveryLine) return 'Finish your reviews'
  return 'Your review'
}
