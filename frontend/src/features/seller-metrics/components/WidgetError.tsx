import { Button } from '@/components/ui/button'
import type { ProblemDetail } from '@/lib/api/client'
import { cn } from '@/lib/utils'

/**
 * The portal's failure block - the same words and the same outline retry the
 * seller's orders and products pages use - sized to live inside one dashboard
 * widget.
 *
 * The dashboard draws each widget from its own query, and an empty list is
 * indistinguishable from a failed one: a broken endpoint would tell a seller
 * they have no sales, which is the one thing a metrics screen must never
 * invent. Each widget renders this instead of its empty state, so a single
 * failing endpoint costs that widget and not the page.
 */
export function WidgetError({
  title,
  error,
  onRetry,
  className,
}: {
  title: string
  error?: ProblemDetail | null
  onRetry: () => void
  /** For the page-level block, which keeps its own card. */
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3', className)}>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">
        {error?.detail ?? 'Something went wrong. Try again.'}
      </p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
