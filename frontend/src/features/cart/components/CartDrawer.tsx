import { ShoppingCart } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatPrice } from '@/lib/formatPrice'

import { useCartOffers } from '../api/useCartOffers'
import { useCart } from '../context/CartContext'
import { CartLineRow } from './CartLineRow'

export function CartDrawer() {
  const { lines, isOpen, close, setQuantity, removeLine, acknowledgePrice, clear } = useCart()
  const variantIds = lines.map((line) => line.variantId)
  const query = useCartOffers(variantIds, isOpen)

  const offersById = new Map((query.data ?? []).map((offer) => [offer.id, offer]))
  const total = lines.reduce((sum, line) => {
    const offer = offersById.get(line.variantId)
    return offer ? sum + offer.price * line.quantity : sum
  }, 0)

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between border-b px-5 py-4 pr-12">
          <SheetTitle>Cart</SheetTitle>
          {lines.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear cart
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5">
          {lines.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ShoppingCart className="size-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">Your cart is empty</p>
              <p className="text-sm text-muted-foreground">Items you add will show up here.</p>
            </div>
          )}

          {query.isError && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load your cart items.</p>
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                Retry
              </Button>
            </div>
          )}

          {!query.isError &&
            lines.map((line) => (
              <CartLineRow
                key={line.variantId}
                line={line}
                offer={offersById.get(line.variantId)}
                isLoading={query.isLoading}
                onQuantityChange={setQuantity}
                onRemove={removeLine}
                onAcknowledgePrice={acknowledgePrice}
              />
            ))}
        </div>

        {lines.length > 0 && !query.isError && (
          <SheetFooter className="border-t px-5 py-4">
            <div className="mb-3 flex w-full items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
            {/* ponytail: no checkout flow exists yet - button is inert */}
            <Button className="w-full rounded-full" size="lg">
              Checkout
            </Button>
            <SheetClose asChild>
              <Button variant="ghost" className="w-full" size="sm">
                Continue shopping
              </Button>
            </SheetClose>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
