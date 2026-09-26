/**
 * Which products the signed-in buyer has bought, and on which order line.
 *
 * The real check is a join from order_line to the buyer's orders; there is no order
 * history in the mock, so a test declares the purchase instead. The point is that
 * the mock still refuses a review without one - a test cannot write a review for
 * something it never said was bought, which is the rule being tested.
 */
const purchasedLines = new Map<string, string>() // productId -> orderLineId

export function givePurchase(productId: string, orderLineId = `line-${productId}`): string {
  purchasedLines.set(productId, orderLineId)
  return orderLineId
}

export function purchasedLineFor(productId: string): string | null {
  return purchasedLines.get(productId) ?? null
}

export function productIdForPurchasedLine(orderLineId: string): string | null {
  for (const [productId, line] of purchasedLines) {
    if (line === orderLineId) return productId
  }
  return null
}

export function resetPurchases() {
  purchasedLines.clear()
}
