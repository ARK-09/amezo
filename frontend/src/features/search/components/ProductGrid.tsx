import { ProductTile } from '@/features/catalog/components/ProductTile'

import type { ProductSummary } from '../schema/types'

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductTile key={product.id} product={product} />
      ))}
    </div>
  )
}
