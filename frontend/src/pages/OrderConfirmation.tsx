import { CheckCircle2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'

import { AppHeader } from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import type { OrderResponse } from '@/features/checkout/api/useCheckout'
import { formatPrice } from '@/lib/formatPrice'

export function OrderConfirmation() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // Only available right after checkout (passed via navigate state) - a
  // refresh or a bookmarked link still shows the order id and the
  // confirmation message below, just not the line-item total.
  const order = (location.state as { order?: OrderResponse } | null)?.order

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader onSearch={(q) => navigate(`/?q=${encodeURIComponent(q)}`)} />

      <div className="mx-auto flex max-w-[560px] flex-1 flex-col items-center justify-center gap-4 px-7 py-16 text-center">
        <CheckCircle2 className="size-12 text-primary" aria-hidden />
        <h1 className="text-2xl font-semibold">Order confirmed</h1>
        <p className="text-sm text-muted-foreground">
          Order <span className="font-mono">{orderId}</span> — a confirmation link has been sent to your email.
        </p>
        {order && <p className="text-sm font-medium">Total: {formatPrice(order.total)}</p>}
        <Link to="/">
          <Button>Continue shopping</Button>
        </Link>
      </div>
    </div>
  )
}
