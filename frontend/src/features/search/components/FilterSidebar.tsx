import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { SearchFilters } from '../schema/types'
import { PriceRangeFilter } from './PriceRangeFilter'

const ALL_CATEGORIES = '__all__'

export function FilterSidebar({
  filters,
  categories,
  onChange,
}: {
  filters: SearchFilters
  categories: string[]
  onChange: (patch: Partial<SearchFilters>) => void
}) {
  return (
    <aside className="sticky top-16 flex h-fit w-56 shrink-0 flex-col gap-6 self-start rounded-xl border p-4">
      <h2 className="text-sm font-bold">Filter</h2>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Category</span>
        <Select
          value={filters.category || ALL_CATEGORIES}
          onValueChange={(v) => onChange({ category: v === ALL_CATEGORIES ? '' : v })}
        >
          <SelectTrigger className="w-full" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Price</span>
        <PriceRangeFilter
          priceMin={filters.priceMin}
          priceMax={filters.priceMax}
          onChange={(priceMin, priceMax) => onChange({ priceMin, priceMax })}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={filters.inStockOnly}
          onChange={(e) => onChange({ inStockOnly: e.target.checked })}
        />
        In stock only
      </label>
    </aside>
  )
}
