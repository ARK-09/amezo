import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'

import { RatingBadge } from '@/components/RatingBadge'
import { ProductFacts } from '@/features/catalog/components/ProductFacts'
import { ProductSpecs } from '@/features/catalog/components/ProductSpecs'
import { Button } from '@/components/ui/button'
import { useAddToCart } from '@/features/catalog/api/useAddToCart'
import { useIsOwnProduct } from '@/features/session/api/useIsOwnProduct'
import { useProduct } from '@/features/catalog/api/useProduct'
import { Breadcrumb } from '@/features/catalog/components/Breadcrumb'
import { BuyBox } from '@/features/catalog/components/BuyBox'
import { ImageGallery } from '@/features/catalog/components/ImageGallery'
import type { ProductTab } from '@/features/catalog/components/ProductTabs'
import { ProductTabs } from '@/features/catalog/components/ProductTabs'
import { ReviewsPanel } from '@/features/catalog/components/ReviewsPanel'
import { VariantSelector } from '@/features/catalog/components/VariantSelector'
import { apiErrorMessage } from '@/lib/api/transient'

/** A path segment that is a UUID came from a link minted before slugs existed. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ProductDetail() {
  const { productRef } = useParams<{ productRef: string }>()
  const query = useProduct(productRef!)
  const { addToCart, isPending } = useAddToCart()

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [tab, setTab] = useState<ProductTab>('details')

  const product = query.data
  // Old links keep working, but they don't linger: once the product resolves, swap
  // the id in the address bar for its slug. `replace` so Back doesn't bounce between
  // the two URLs.
  const arrivedByLegacyId = Boolean(productRef && UUID_PATTERN.test(productRef))
  // The seller looking at their own listing. The rule is enforced in checkout - this
  // is what stops the buy box offering something the order will refuse.
  const isOwnProduct = useIsOwnProduct(product?.sellerId)
  const selectedVariant =
    product?.variants.find((v) => v.id === selectedVariantId) ??
    product?.variants.find((v) => v.stockQty > 0) ??
    product?.variants[0]

  function selectVariant(variantId: string) {
    setSelectedVariantId(variantId)
    setQuantity(1)
  }

  if (product && arrivedByLegacyId) {
    return <Navigate to={`/products/${product.slug}`} replace />
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] flex-1 px-7 py-5">
      {query.isLoading && <p className="text-sm text-muted-foreground">Loading product…</p>}

      {query.isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">Couldn't load this product</p>
          <p className="text-sm text-muted-foreground">
            {apiErrorMessage(query.error)}
          </p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {product && selectedVariant && (
        <>
          <Breadcrumb
            category={product.category}
            brandName={product.brandName}
            store={product.store}
            title={product.title}
          />

          <div className="flex flex-wrap items-start gap-8">
            <ImageGallery images={product.images} title={product.title} />

            <div className="min-w-[300px] flex-1">
              <h1 className="mb-3.5 text-2xl">{product.title}</h1>

              <div className="mb-4 flex flex-wrap items-center gap-3">
                {product.reviewSummary.averageRating != null && (
                  <RatingBadge rating={product.reviewSummary.averageRating} />
                )}
                <span className="border-l pl-3 text-sm text-muted-foreground">
                  {product.reviewSummary.count} reviews
                </span>
                {product.brandName && (
                  <span className="text-sm text-muted-foreground">
                    Sold by{' '}
                    {/* By handle. `store` is optional in the contract, so a payload
                        without one falls back to the display name, which /stores
                        resolves - never to a slugified guess at the handle. */}
                    <Link
                      to={
                        product.store
                          ? `/stores/${product.store.handle}`
                          : `/stores/${encodeURIComponent(product.brandName)}`
                      }
                      className="font-semibold text-foreground underline decoration-border underline-offset-[3px] hover:decoration-primary"
                    >
                      {product.brandName}
                    </Link>
                  </span>
                )}
              </div>

              <VariantSelector
                variants={product.variants}
                selectedId={selectedVariant.id}
                onSelect={selectVariant}
              />

              <ProductFacts variant={selectedVariant} storeHandle={product.store?.handle} />
            </div>

            <BuyBox
              price={selectedVariant.price}
              stockQty={selectedVariant.stockQty}
              quantity={quantity}
              onQuantityChange={setQuantity}
              isAdding={isPending}
              isOwnProduct={isOwnProduct}
              onAddToCart={() => addToCart(selectedVariant.id, quantity, selectedVariant.price)}
            />
          </div>

          <div className="mt-11 border-t pt-1">
            <ProductTabs tab={tab} reviewCount={product.reviewSummary.count} onChange={setTab} />

            {tab === 'details' && (
              <div>
                <p className="mb-5 max-w-[62ch] text-[14.5px] leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
                <ProductSpecs attributes={product.attributes ?? []} />
              </div>
            )}

            {tab === 'reviews' && (
              <ReviewsPanel
                productSlug={product.slug}
                averageRating={product.reviewSummary.averageRating}
                reviewCount={product.reviewSummary.count}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
