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
  isOwnProduct = false,
}: {
  price: number
  stockQty: number
  quantity: number
  onQuantityChange: (quantity: number) => void
  onAddToCart: () => void
  isAdding: boolean
  /**
   * True when the signed-in seller is looking at their own listing. Checkout refuses
   * the order either way; this is so they find out here rather than at the end.
   */
  isOwnProduct?: boolean
}) {
  const inStock = stockQty > 0
  const buyable = inStock && !isOwnProduct

  return (
    <div className="w-full max-w-[320px] shrink-0 rounded-xl border p-5">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{formatPrice(price)}</span>
      </div>
      <div className="mb-5 text-sm text-muted-foreground">
        {inStock ? 'In stock' : 'Out of stock'}
      </div>

      {isOwnProduct && (
        <p role="status" className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          This is your own listing, so you can't buy it.
        </p>
      )}

      <div className="mb-2 text-sm font-bold">Quantity</div>
      <div className="mb-2 flex items-center overflow-hidden rounded-md border">
        <button
          type="button"
          onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
          disabled={!buyable || quantity <= 1}
          aria-label="Decrease quantity"
          className="flex h-10 w-10 items-center justify-center border-r text-muted-foreground disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>
        <div className="flex-1 text-center text-sm font-semibold">{quantity}</div>
        <button
          type="button"
          onClick={() => onQuantityChange(Math.min(stockQty, quantity + 1))}
          disabled={!buyable || quantity >= stockQty}
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
        disabled={!buyable || isAdding}
        onClick={onAddToCart}
      >
        {isOwnProduct ? 'Your own product' : inStock ? 'Add to cart' : 'Out of stock'}
      </Button>
    </div>
  )
}
