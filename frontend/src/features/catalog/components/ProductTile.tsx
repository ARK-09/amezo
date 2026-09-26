import { ImageOff, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router'

import { RatingBadge } from '@/components/RatingBadge'
import { useAddToCart } from '@/features/catalog/api/useAddToCart'
import { useIsOwnProduct } from '@/features/session/api/useIsOwnProduct'
import type { ProductSummary } from '@/features/search/schema/types'
import { formatPrice } from '@/lib/formatPrice'

/**
 * The marketplace product card, shared by the landing rails, search results
 * and seller storefronts so a product looks the same wherever it appears.
 *
 * The design also shows a "-25%" flash and a struck-through was-price. The
 * catalog has no compare-at price to derive either from, so rather than
 * invent a discount on a real listing the markup is driven by `compareAt`
 * and simply stays dormant until the API carries one.
 */
export function ProductTile({
  product,
  subtitle,
  compareAt,
}: {
  product: ProductSummary
  subtitle?: string
  compareAt?: number
}) {
  const { addToCart } = useAddToCart()
  // A seller cannot buy their own listing. Checkout enforces it; the card knowing
  // costs nothing (the summary already carries the owner) and saves the seller from
  // finding out at the end of a checkout.
  const isOwnProduct = useIsOwnProduct(product.sellerId)
  // The summary carries the variant to add, so this button does no work beyond a
  // reducer dispatch - no request, nothing to wait for. It used to fetch the
  // whole product on click just to learn a variant id, which on a cold backend
  // meant the cart sat empty for as long as that took.
  const addable = product.inStock && product.defaultVariantId != null && !isOwnProduct
  // Slug, not id: product URLs are readable and stable, and the raw key stays
  // internal.
  const href = `/products/${product.slug}`
  const discount =
    compareAt && compareAt > product.priceFrom
      ? Math.round((1 - product.priceFrom / compareAt) * 100)
      : null

  return (
    <article className="flex h-full flex-col gap-3 overflow-hidden rounded-lg border bg-card">
      <Link
        to={href}
        className="relative flex aspect-square items-center justify-center bg-muted p-4"
        tabIndex={-1}
        aria-hidden
      >
        {product.thumbnailUrl ? (
          <img src={product.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImageOff className="size-8 text-muted-foreground" aria-hidden />
        )}
        {discount !== null && (
          <span className="absolute top-2.5 left-2.5 rounded-sm bg-primary px-[7px] py-[3px] text-[10px] font-bold text-primary-foreground">
            -{discount}%
          </span>
        )}
        {!product.inStock && (
          <span className="absolute top-2.5 left-2.5 rounded-sm bg-foreground px-[7px] py-[3px] text-[10px] font-bold text-background">
            Out of stock
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3">
        <div className="flex items-baseline gap-[7px]">
          <p className="text-base font-semibold">{formatPrice(product.priceFrom)}</p>
          {compareAt != null && discount !== null && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(compareAt)}
            </span>
          )}
        </div>

        <Link to={href} className="line-clamp-2 text-sm leading-snug hover:text-primary">
          {product.title}
        </Link>

        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}

        {/* mt-auto anchors this row to the card's bottom edge regardless of
            whether the title above wrapped to one line or the full two. */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          {product.avgRating != null && <RatingBadge rating={product.avgRating} />}
          <button
            type="button"
            className="ml-auto inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            disabled={!addable}
            aria-label={
              isOwnProduct
                ? 'Your own product'
                : product.inStock
                  ? 'Add to cart'
                  : 'Out of stock'
            }
            onClick={() =>
              addable &&
              addToCart(
                product.defaultVariantId!,
                1,
                // The default variant's own price, not priceFrom: the cheapest
                // offer can be the sold-out one, and the cart stores what was
                // actually added so the drawer's price-change check stays honest.
                product.defaultVariantPrice ?? product.priceFrom,
              )
            }
          >
            <ShoppingCart className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </article>
  )
}
