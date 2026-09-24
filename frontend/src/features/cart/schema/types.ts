import type { components } from '@/lib/api/schema'

export type VariantOffer = components['schemas']['VariantOffer']

export interface CartLine {
  variantId: string
  quantity: number
  priceWhenAdded: number
}
