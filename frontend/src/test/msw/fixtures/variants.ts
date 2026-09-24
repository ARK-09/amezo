import type { components } from '@/lib/api/schema'

import { productDetails } from './productDetails'

type VariantOffer = components['schemas']['VariantOffer']

export const variantOffers: Record<string, VariantOffer> = Object.fromEntries(
  Object.values(productDetails).flatMap((product) =>
    product.variants.map((variant) => [
      variant.id,
      {
        id: variant.id,
        productId: product.id,
        productTitle: product.title,
        variantLabel: variant.label,
        thumbnailUrl: null,
        price: variant.price,
        stockQty: variant.stockQty,
      } satisfies VariantOffer,
    ]),
  ),
)
