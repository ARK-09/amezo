import { Minus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/formatPrice'

export function BuyBox({
  price,
  stockQty,
  quantity,
  onQuantityChange,
  onAddToCart,
  isAdding,
}: {
  price: number
  stockQty: number
  quantity: number
  onQuantityChange: (quantity: number) => void
  onAddToCart: () => void
  isAdding: boolean
}) {
  const inStock = stockQty > 0

  return (
    <div className="w-full max-w-[320px] shrink-0 rounded-xl border p-5">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{formatPrice(price)}</span>
      </div>
      <div className="mb-5 text-sm text-muted-foreground">
        {inStock ? 'In stock' : 'Out of stock'}
      </div>

      <div className="mb-2 text-sm font-bold">Quantity</div>
      <div className="mb-2 flex items-center overflow-hidden rounded-md border">
        <button
          type="button"
          onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
          disabled={!inStock || quantity <= 1}
          aria-label="Decrease quantity"
          className="flex h-10 w-10 items-center justify-center border-r text-muted-foreground disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>
        <div className="flex-1 text-center text-sm font-semibold">{quantity}</div>
        <button
          type="button"
          onClick={() => onQuantityChange(Math.min(stockQty, quantity + 1))}
          disabled={!inStock || quantity >= stockQty}
          aria-label="Increase quantity"
          className="flex h-10 w-10 items-center justify-center border-l text-muted-foreground disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="mb-5 flex justify-between text-sm">
        <span>Subtotal</span>
        <span className="font-bold">{formatPrice(price * quantity)}</span>
      </div>

      <Button
        className="w-full rounded-full"
        size="lg"
        disabled={!inStock || isAdding}
        onClick={onAddToCart}
      >
        {inStock ? 'Add to cart' : 'Out of stock'}
      </Button>
    </div>
  )
}
