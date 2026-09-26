import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { RefundDecisionPanel } from '@/features/refunds/components/RefundDecisionPanel'

/** The full-page view behind the refunds drawer's "full page" button. */
export function SellerRefundDetail() {
  const { refundRequestId = '' } = useParams()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/seller/refunds">
            <ArrowLeft className="size-4" aria-hidden /> Refunds
          </Link>
        </Button>
      </div>

      <div className="max-w-[720px]">
        <RefundDecisionPanel refundRequestId={refundRequestId} />
      </div>
    </div>
  )
}
