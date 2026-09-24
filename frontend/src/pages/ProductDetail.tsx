import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { AppHeader } from '@/components/layout/AppHeader'
import { RatingBadge } from '@/components/RatingBadge'
import { Button } from '@/components/ui/button'
import { useAddToCart } from '@/features/catalog/api/useAddToCart'
import { useProduct } from '@/features/catalog/api/useProduct'
import { Breadcrumb } from '@/features/catalog/components/Breadcrumb'
import { BuyBox } from '@/features/catalog/components/BuyBox'
import { ImageGallery } from '@/features/catalog/components/ImageGallery'
import type { ProductTab } from '@/features/catalog/components/ProductTabs'
import { ProductTabs } from '@/features/catalog/components/ProductTabs'
import { ReviewsPanel } from '@/features/catalog/components/ReviewsPanel'
import { VariantSelector } from '@/features/catalog/components/VariantSelector'

export function ProductDetail() {
  const { productId } = useParams<{ productId: string }>()
  const navigate = useNavigate()
  const query = useProduct(productId!)
  const { addToCart, isPending } = useAddToCart()

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [tab, setTab] = useState<ProductTab>('details')

  const product = query.data
  const selectedVariant =
    product?.variants.find((v) => v.id === selectedVariantId) ??
    product?.variants.find((v) => v.stockQty > 0) ??
    product?.variants[0]

  function selectVariant(variantId: string) {
    setSelectedVariantId(variantId)
    setQuantity(1)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader onSearch={(q) => navigate(`/?q=${encodeURIComponent(q)}`)} />

      <div className="mx-auto w-full max-w-[1320px] flex-1 px-7 py-5">
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading product…</p>}

        {query.isError && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-medium">Couldn't load this product</p>
            <p className="text-sm text-muted-foreground">
              {query.error?.detail ?? 'Something went wrong. Try again.'}
            </p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {product && selectedVariant && (
          <>
            <Breadcrumb category={product.category} brandName={product.brandName} title={product.title} />

            <div className="flex flex-wrap items-start gap-8">
              <ImageGallery images={product.images} title={product.title} />

              <div className="min-w-[300px] flex-1">
                <h1 className="mb-3.5 text-2xl">{product.title}</h1>

                <div className="mb-4 flex items-center gap-3">
                  {product.reviewSummary.averageRating != null && (
                    <RatingBadge rating={product.reviewSummary.averageRating} />
                  )}
                  <span className="border-l pl-3 text-sm text-muted-foreground">
                    {product.reviewSummary.count} reviews
                  </span>
                </div>

                <VariantSelector
                  variants={product.variants}
                  selectedId={selectedVariant.id}
                  onSelect={selectVariant}
                />
              </div>

              <BuyBox
                price={selectedVariant.price}
                stockQty={selectedVariant.stockQty}
                quantity={quantity}
                onQuantityChange={setQuantity}
                isAdding={isPending}
                onAddToCart={() => addToCart(selectedVariant.id, quantity)}
              />
            </div>

            <div className="mt-11 border-t pt-1">
              <ProductTabs tab={tab} reviewCount={product.reviewSummary.count} onChange={setTab} />

              {tab === 'details' && (
                <p className="max-w-[62ch] text-[14.5px] leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
              )}

              {tab === 'reviews' && (
                <ReviewsPanel
                  productId={product.id}
                  averageRating={product.reviewSummary.averageRating}
                  reviewCount={product.reviewSummary.count}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
