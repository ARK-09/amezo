import { cn } from '@/lib/utils'

export type ProductTab = 'details' | 'reviews'

export function ProductTabs({
  tab,
  reviewCount,
  onChange,
}: {
  tab: ProductTab
  reviewCount: number
  onChange: (tab: ProductTab) => void
}) {
  const tabs: { key: ProductTab; label: string; count?: number }[] = [
    { key: 'details', label: 'Details' },
    { key: 'reviews', label: 'Reviews', count: reviewCount },
  ]

  return (
    <div className="mb-5 flex flex-wrap items-center gap-7 border-b" role="tablist">
      {tabs.map((t) => {
        const active = t.key === tab
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 py-3.5 text-sm',
              active
                ? 'border-primary font-bold'
                : 'border-transparent font-medium text-muted-foreground',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
