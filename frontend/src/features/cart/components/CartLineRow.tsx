import { ImageOff, Minus, Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/formatPrice'

import type { CartLine, VariantOffer } from '../schema/types'

export function CartLineRow({
  line,
  offer,
  isLoading,
  onQuantityChange,
  onRemove,
  onAcknowledgePrice,
}: {
  line: CartLine
  offer: VariantOffer | undefined
  isLoading: boolean
  onQuantityChange: (variantId: string, quantity: number) => void
  onRemove: (variantId: string) => void
  onAcknowledgePrice: (variantId: string, price: number) => void
}) {
  if (isLoading) {
    return (
      <div className="flex gap-3 border-b py-4">
        <div className="size-16 shrink-0 animate-pulse rounded-md bg-muted" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (!offer) {
    return (
      <div className="flex items-center gap-3 border-b py-4 opacity-60">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted">
          <ImageOff className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <p className="flex-1 text-sm font-medium">No longer available</p>
        <Button variant="ghost" size="icon" aria-label="Remove from cart" onClick={() => onRemove(line.variantId)}>
          <X className="size-4" />
        </Button>
      </div>
    )
  }

  const outOfStock = offer.stockQty === 0
  const lowStock = !outOfStock && offer.stockQty < line.quantity
  const priceChanged = offer.price !== line.priceWhenAdded
  const lineTotal = offer.price * line.quantity

  return (
    <div className="flex gap-3 border-b py-4">
      <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted">
        {offer.thumbnailUrl ? (
          <img src={offer.thumbnailUrl} alt={offer.productTitle} className="size-full rounded-md object-cover" />
        ) : (
          <ImageOff className="size-6 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <p className="line-clamp-2 text-sm font-medium">{offer.productTitle}</p>
        <p className="text-xs text-muted-foreground">{offer.variantLabel}</p>
        <p className="text-sm">{formatPrice(offer.price)} each</p>

        {outOfStock && <p className="text-xs font-medium text-destructive">Out of stock</p>}
        {lowStock && <p className="text-xs font-medium text-destructive">Only {offer.stockQty} left</p>}
        {priceChanged && (
          <p className="text-xs text-muted-foreground">
            Price updated: was {formatPrice(line.priceWhenAdded)}, now {formatPrice(offer.price)}{' '}
            <button
              type="button"
              className="underline"
              onClick={() => onAcknowledgePrice(line.variantId, offer.price)}
            >
              Dismiss
            </button>
          </p>
        )}

        <div className="mt-1 flex items-center gap-3">
          <div className="flex items-center overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => onQuantityChange(line.variantId, Math.max(1, line.quantity - 1))}
              disabled={outOfStock}
              aria-label="Decrease quantity"
              className="flex h-7 w-7 items-center justify-center text-muted-foreground disabled:opacity-40"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-6 text-center text-sm">{line.quantity}</span>
            <button
              type="button"
              onClick={() => onQuantityChange(line.variantId, Math.min(offer.stockQty, line.quantity + 1))}
              disabled={outOfStock || line.quantity >= offer.stockQty}
              aria-label="Increase quantity"
              className="flex h-7 w-7 items-center justify-center text-muted-foreground disabled:opacity-40"
            >
              <Plus className="size-3" />
            </button>
          </div>
          <span className="text-sm font-semibold">{formatPrice(lineTotal)}</span>
        </div>
      </div>

      <Button variant="ghost" size="icon" aria-label="Remove from cart" onClick={() => onRemove(line.variantId)}>
        <X className="size-4" />
      </Button>
    </div>
  )
}
