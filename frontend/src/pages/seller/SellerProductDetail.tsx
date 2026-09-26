import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { ProductFormPanel } from '@/features/seller-portal/components/ProductFormPanel'

/**
 * The full-page form. Same panel the products list shows in its drawer - this
 * route is what the drawer's "open full page" button opens in a new tab.
 */
export function SellerProductDetail() {
  const { productId = '' } = useParams()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/seller/products">
            <ArrowLeft className="size-4" aria-hidden /> Products
          </Link>
        </Button>
      </div>

      <ProductFormPanel productId={productId} />
    </div>
  )
}
