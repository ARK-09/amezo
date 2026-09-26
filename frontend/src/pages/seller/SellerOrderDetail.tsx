import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { SellerOrderPanel } from '@/features/seller-portal/components/SellerOrderPanel'

/**
 * The full-page order view. Same panel the orders list shows in its drawer -
 * this route is what the drawer's "open full page" button opens in a new tab.
 */
export function SellerOrderDetail() {
  const { orderId = '' } = useParams()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/seller/orders">
            <ArrowLeft className="size-4" aria-hidden /> Orders
          </Link>
        </Button>
      </div>

      <div className="max-w-[720px]">
        <SellerOrderPanel orderId={orderId} />
      </div>
    </div>
  )
}
