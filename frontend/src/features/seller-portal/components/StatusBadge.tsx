import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { statusLabel } from './statusLabel'

type Tone = 'neutral' | 'positive' | 'progress' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  positive: 'border-transparent bg-[#16794c]/10 text-[#16794c]',
  progress: 'border-transparent bg-primary/10 text-[#b8560a]',
  warning: 'border-transparent bg-[#ffc53d]/25 text-[#8a5a00]',
  danger: 'border-transparent bg-[#b42318]/10 text-[#b42318]',
}

/**
 * One badge for every status the portal prints, so PLACED, DRAFT and DECLINED
 * cannot drift into three different visual languages across three screens.
 */
const TONE_FOR: Record<string, Tone> = {
  // products
  ACTIVE: 'positive',
  DRAFT: 'neutral',
  ARCHIVED: 'neutral',
  // orders
  PLACED: 'progress',
  PACKED: 'progress',
  SHIPPED: 'progress',
  IN_TRANSIT: 'progress',
  OUT_FOR_DELIVERY: 'progress',
  DELIVERED: 'positive',
  CANCELLED: 'danger',
  // refunds
  REQUESTED: 'warning',
  APPROVED: 'progress',
  AWAITING_RETURN: 'progress',
  RETURN_RECEIVED: 'progress',
  // Shared by a refund request that completed and by an order derived REFUNDED
  // from one. Both mean the same thing - the money went back and the process
  // finished - so one tone is right for both.
  REFUNDED: 'positive',
  REPLACEMENT_SENT: 'positive',
  DECLINED: 'danger',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge className={cn('px-2.5 py-0.5 text-[11px] font-bold', TONE[TONE_FOR[status] ?? 'neutral'], className)}>
      {statusLabel(status)}
    </Badge>
  )
}
