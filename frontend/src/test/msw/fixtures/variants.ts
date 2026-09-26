import type { components } from '@/lib/api/schema'

import { productDetails } from './productDetails'

type VariantOffer = components['schemas']['VariantOffer']

export const variantOffers: Record<string, VariantOffer> = Object.fromEntries(
  // productDetails is keyed by slug AND id, so de-duplicate by product before
  // walking variants or every offer would be built twice.
  Array.from(new Map(Object.values(productDetails).map((p) => [p.id, p])).values()).flatMap((product) =>
    product.variants.map((variant) => [
      variant.id,
      {
        id: variant.id,
        productId: product.id,
        productSlug: product.slug,
        productTitle: product.title,
        variantLabel: variant.label,
        thumbnailUrl: null,
        price: variant.price,
        stockQty: variant.stockQty,
        sellerId: product.sellerId,
      } satisfies VariantOffer,
    ]),
  ),
)
