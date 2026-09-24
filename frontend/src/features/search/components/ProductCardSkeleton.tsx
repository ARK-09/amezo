import { Card } from '@/components/ui/card'

export function ProductCardSkeleton() {
  return (
    <Card className="gap-3 overflow-hidden py-0">
      <div className="aspect-square animate-pulse bg-muted" />
      <div className="flex flex-col gap-2 px-3 pb-3">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-8 w-full animate-pulse rounded bg-muted" />
      </div>
    </Card>
  )
}
