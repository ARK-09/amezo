import { ShoppingBag } from 'lucide-react'

import { useCart } from '../context/CartContext'

export function CartTrigger() {
  const { itemCount, open } = useCart()

  return (
    <button
      type="button"
      aria-label={`Open cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
      onClick={open}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[13px] font-semibold transition-colors hover:bg-accent"
    >
      <ShoppingBag className="size-4" aria-hidden />
      <span className="hidden sm:inline">Cart</span>
      {itemCount > 0 && (
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  )
}
