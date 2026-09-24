import { ImageOff } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { formatPrice } from '@/lib/formatPrice'

import type { EnrichedCartLine } from '../api/useCheckoutCart'

export function OrderSummary({
  lines,
  total,
  isLoading,
  isError,
}: {
  lines: EnrichedCartLine[]
  total: number
  isLoading: boolean
  isError: boolean
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <h2 className="font-semibold">Order summary</h2>

        {isLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="size-14 shrink-0 animate-pulse rounded-md bg-muted" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <p className="text-sm text-muted-foreground">Couldn't load your cart items.</p>
        )}

        {!isLoading && !isError && (
          <div className="flex flex-col gap-4">
            {lines.map(({ line, offer }) => (
              <div key={line.variantId} className="flex gap-3">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
                  {offer.thumbnailUrl ? (
                    <img
                      src={offer.thumbnailUrl}
                      alt={offer.productTitle}
                      className="size-full rounded-md object-cover"
                    />
                  ) : (
                    <ImageOff className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <p className="line-clamp-2 text-sm font-medium">{offer.productTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {offer.variantLabel} · Qty {line.quantity}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold">{formatPrice(offer.price * line.quantity)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
