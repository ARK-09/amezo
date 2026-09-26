import { ImageOff } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { useProductOpenOrders } from '@/features/seller-portal/api/useSellerCatalog'
import { useSellerProduct } from '@/features/seller-portal/api/useSellerProducts'
import { StatusBadge } from '@/features/seller-portal/components/StatusBadge'
import { apiErrorMessage } from '@/lib/api/transient'
import { formatMediumDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'
import { cn } from '@/lib/utils'

/**
 * The read-only half of a product: what the seller sees before deciding to edit
 * it. The design opens this on a row click and keeps editing behind its own
 * button, because most visits to a product are to look something up - what is
 * on order, whether a variant is out of stock - not to change it.
 *
 * Carries no drawer chrome of its own. The drawer owns the header, the scroll
 * boundary and the action bar; this is the body, so the same panel could be
 * rendered on a standalone route without stripping anything out.
 */
export function ProductViewPanel({ productId }: { productId: string }) {
  const product = useSellerProduct(productId)
  const openOrders = useProductOpenOrders(productId)

  if (product.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[72px] w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (product.isError || !product.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {apiErrorMessage(product.error)}
      </p>
    )
  }

  const detail = product.data
  const prices = detail.variants.map((variant) => variant.price).filter((price): price is number => price != null)
  const priceFrom = prices.length ? Math.min(...prices) : null
  const priceTo = prices.length ? Math.max(...prices) : null
  const totalStock = detail.variants.reduce((sum, variant) => sum + (variant.stockQty ?? 0), 0)

  return (
    <div className="flex flex-col gap-5">
      <ImageStrip images={detail.images} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-3">
        <Tile label="Price">
          {priceFrom == null
            ? '—'
            : priceFrom === priceTo
              ? formatPrice(priceFrom)
              : `${formatPrice(priceFrom)} – ${formatPrice(priceTo ?? priceFrom)}`}
        </Tile>
        <Tile label="Stock">{totalStock === 0 ? 'Out of stock' : totalStock}</Tile>
        {/* Its own query, so it loads behind a dash rather than holding up the
            whole panel - the other two tiles come from data already in hand. */}
        <Tile label="Open orders">{openOrders.isSuccess ? openOrders.data.openOrderCount : '—'}</Tile>
      </div>

      <ActiveOrders productId={productId} />

      <section>
        <SectionHeading>Variants</SectionHeading>
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[minmax(0,1fr)_1fr_72px_64px] gap-2 bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>Label</span>
            <span>SKU</span>
            <span className="text-right">Price</span>
            <span className="text-right">Stock</span>
          </div>
          {detail.variants.map((variant) => (
            <div
              key={variant.id}
              className="grid grid-cols-[minmax(0,1fr)_1fr_72px_64px] items-center gap-2 border-t px-3 py-2.5 text-[13px]"
            >
              <span className="truncate font-semibold">{variant.label}</span>
              <span className="truncate text-muted-foreground tabular-nums">{variant.sku}</span>
              <span className="text-right tabular-nums">
                {variant.price == null ? '—' : formatPrice(variant.price)}
              </span>
              <span
                className={cn(
                  'text-right tabular-nums',
                  (variant.stockQty ?? 0) === 0 && 'font-semibold text-[#b42318]',
                )}
              >
                {variant.stockQty ?? 0}
              </span>
            </div>
          ))}
        </div>
      </section>

      {detail.description && (
        <section>
          <SectionHeading>Description</SectionHeading>
          <p className="text-sm leading-relaxed text-pretty">{detail.description}</p>
        </section>
      )}

      <div className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
        <span>Created {formatMediumDate(detail.createdAt)}</span>
        <span>Last updated {formatMediumDate(detail.updatedAt)}</span>
        <span className="tabular-nums">ID {detail.id}</span>
      </div>
    </div>
  )
}

function ImageStrip({ images }: { images: { id: string; url: string }[] }) {
  if (images.length === 0) {
    return (
      <div className="flex size-[72px] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
        <ImageOff className="size-[18px]" aria-hidden />
      </div>
    )
  }
  return (
    <div className="flex gap-2 overflow-x-auto">
      {images.map((image) => (
        <img
          key={image.id}
          src={image.url}
          alt=""
          className="size-[72px] shrink-0 rounded-lg border bg-muted object-cover"
        />
      ))}
    </div>
  )
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[15px] font-bold tabular-nums">{children}</p>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">{children}</h3>
  )
}

/**
 * Orders placed against this product that are not finished - PLACED or SHIPPED.
 * The seller's reason to care about a product they are looking at: how much of
 * its stock is already promised away.
 */
function ActiveOrders({ productId }: { productId: string }) {
  const query = useProductOpenOrders(productId)

  const units = query.data?.reservedUnits ?? 0
  const orders = query.data?.orders ?? []

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <SectionHeading>Active orders</SectionHeading>
        {units > 0 && (
          <span className="text-xs text-muted-foreground">
            {units} {units === 1 ? 'unit' : 'units'} reserved
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border">
        {query.isLoading && <Skeleton className="h-[44px] w-full rounded-none" />}

        {query.isError && (
          <p role="alert" className="px-3 py-4 text-center text-[13px] text-destructive">
            {apiErrorMessage(query.error)}
          </p>
        )}

        {query.isSuccess && orders.length === 0 && (
          <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">
            No open orders for this product.
          </p>
        )}

        {orders.map((order) => (
          <div
            key={order.orderLineId}
            className="flex flex-wrap items-center gap-2.5 border-b px-3 py-2.5 last:border-b-0"
          >
            {/* The order id's leading block, which is what the seller quotes and
                searches by - the whole uuid is unreadable at this size. */}
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {order.orderId.slice(0, 8)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{order.buyerEmail}</span>
            <span className="shrink-0 text-[13px] text-muted-foreground">
              {/* A variant deleted since the purchase has no label left; the
                  quantity alone is still true. */}
              {order.variantLabel ? `${order.quantity} × ${order.variantLabel}` : `${order.quantity} ×`}
            </span>
            <StatusBadge status={order.status} className="shrink-0" />
          </div>
        ))}
      </div>
    </section>
  )
}
