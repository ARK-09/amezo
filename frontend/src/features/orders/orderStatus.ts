import type { OrderStatus } from './api/useBuyerOrders'

/**
 * Two questions the buyer's order screens keep asking of a status, in one place so
 * the collapsed card and the panel under it cannot answer them differently.
 *
 * REFUNDED is where they used to disagree. It is derived from the refund request,
 * not a fulfilment stage, so an order that arrived and was then refunded is still
 * an order that arrived: it keeps its "Delivered" headline and its Reviews block.
 * Read as "not delivered" it lost both the moment the seller paid the money back.
 */
export function hasArrived(status: OrderStatus): boolean {
  return status === 'DELIVERED' || status === 'REFUNDED'
}

/**
 * Whether the parcel is with a carrier, which is the only time tracking means
 * anything. PLACED and PACKED are still with the seller - the design's single
 * in-transit order does not show what a Track package button on those should do,
 * and offering one that tracks nothing is worse than not offering it.
 */
export function isInTransit(status: OrderStatus): boolean {
  return status === 'SHIPPED' || status === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY'
}
