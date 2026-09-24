import type { components } from '@/lib/api/schema'

type SellerOrderDetail = components['schemas']['SellerOrderDetail']

let orders: SellerOrderDetail[] = []

export function resetSellerOrders(seed: SellerOrderDetail[] = []) {
  orders = [...seed]
}

export function listSellerOrders(): SellerOrderDetail[] {
  return orders
}

export function findSellerOrder(id: string): SellerOrderDetail | undefined {
  return orders.find((order) => order.id === id)
}

export function updateSellerOrder(id: string, patch: Partial<SellerOrderDetail>): SellerOrderDetail | undefined {
  const order = findSellerOrder(id)
  if (!order) return undefined
  Object.assign(order, patch)
  return order
}

function total(order: Pick<SellerOrderDetail, 'lines'>) {
  return order.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
}

export function summaryOf(order: SellerOrderDetail) {
  return {
    id: order.id,
    buyerEmail: order.buyerEmail,
    placedAt: order.placedAt,
    total: total(order),
    status: order.status,
  }
}
