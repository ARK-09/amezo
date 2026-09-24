import { ShoppingCart } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useCart } from '../context/CartContext'

export function CartTrigger() {
  const { itemCount, open } = useCart()

  return (
    <Button
      variant="outline"
      size="icon"
      className="relative shrink-0"
      aria-label={`Open cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
      onClick={open}
    >
      <ShoppingCart />
      {itemCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </Button>
  )
}
