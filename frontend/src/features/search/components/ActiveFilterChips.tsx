import { X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { SearchFilters } from '../schema/types'
import { formatPrice } from '../utils/formatPrice'

type FilterKey = 'q' | 'category' | 'price' | 'inStockOnly'

export function ActiveFilterChips({
  filters,
  onRemove,
  onClearAll,
}: {
  filters: SearchFilters
  onRemove: (key: FilterKey) => void
  onClearAll: () => void
}) {
  const chips: { key: FilterKey; label: string }[] = []

  if (filters.q) chips.push({ key: 'q', label: `"${filters.q}"` })
  if (filters.category) chips.push({ key: 'category', label: filters.category })
  if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
    const min = filters.priceMin !== undefined ? formatPrice(filters.priceMin) : 'Any'
    const max = filters.priceMax !== undefined ? formatPrice(filters.priceMax) : 'Any'
    chips.push({ key: 'price', label: `${min} – ${max}` })
  }
  if (filters.inStockOnly) chips.push({ key: 'inStockOnly', label: 'In stock only' })

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge key={chip.key} variant="outline" className="gap-1 pr-1.5">
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.key)}
            aria-label={`Remove ${chip.label} filter`}
            className="flex size-4 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent"
          >
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}
      <Button variant="link" size="sm" onClick={onClearAll} className="h-auto p-0">
        Clear all filters
      </Button>
    </div>
  )
}
