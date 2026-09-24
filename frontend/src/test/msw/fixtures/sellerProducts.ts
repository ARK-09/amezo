import type { components } from '@/lib/api/schema'

type SellerProductSummary = components['schemas']['SellerProductSummary']

let products: SellerProductSummary[] = []

export function resetSellerProducts(seed: SellerProductSummary[] = []) {
  products = [...seed]
}

export function listSellerProducts(): SellerProductSummary[] {
  return products
}

export function addSellerProduct(product: SellerProductSummary) {
  products = [product, ...products]
}

export function removeSellerProduct(id: string) {
  products = products.filter((p) => p.id !== id)
}
