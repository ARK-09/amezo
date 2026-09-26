import { X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { categoryName, type Category } from '@/features/reference/api/useCategories'
import { formatPrice } from '@/lib/formatPrice'

import type { SearchFilters } from '../schema/types'

type FilterKey = 'q' | 'category' | 'price' | 'inStockOnly'

export function ActiveFilterChips({
  filters,
  categories,
  onRemove,
  onClearAll,
}: {
  filters: SearchFilters
  /**
   * The system list, so a category chip reads as its display name. filters.category
   * holds the slug - that is what the URL carries - and a chip saying "home-garden"
   * would be showing a machine value to a shopper.
   */
  categories: Category[]
  onRemove: (key: FilterKey) => void
  onClearAll: () => void
}) {
  const chips: { key: FilterKey; label: string }[] = []

  if (filters.q) chips.push({ key: 'q', label: `"${filters.q}"` })
  if (filters.category) {
    chips.push({ key: 'category', label: categoryName(categories, filters.category) })
  }
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
