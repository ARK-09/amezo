import { ImageOff, ShoppingCart, Star } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import type { ProductSummary } from '../schema/types'
import { formatPrice } from '../utils/formatPrice'

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Card className="h-full gap-3 overflow-hidden py-0">
      <div className="flex aspect-square items-center justify-center bg-muted">
        {product.thumbnailUrl ? (
          <img
            src={product.thumbnailUrl}
            alt={product.title}
            className="size-full object-cover"
          />
        ) : (
          <ImageOff className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-1.5 px-3 pb-3">
        <p className="text-base font-semibold">{formatPrice(product.priceFrom)}</p>
        <p className="line-clamp-2 text-sm leading-snug">{product.title}</p>
        {/* mt-auto anchors this row to the card's bottom edge regardless of
            whether the title above wrapped to one line or the full two -
            cards in the same grid row are already equal height via CSS
            grid's default align-items: stretch. */}
        <div className="mt-auto flex items-center gap-2">
          {product.avgRating != null && (
            <span className="flex w-fit items-center gap-1 rounded-full bg-[#ffc53d] px-2.5 py-1 text-xs font-bold text-[#1d2026]">
              <Star className="size-2.5 fill-current" />
              {product.avgRating.toFixed(1)}
            </span>
          )}
          <Button
            size="icon"
            className="ml-auto"
            disabled={!product.inStock}
            aria-label={product.inStock ? 'Add to cart' : 'Out of stock'}
          >
            <ShoppingCart />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
