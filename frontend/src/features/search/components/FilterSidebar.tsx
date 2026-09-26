import { SearchableSelect } from '@/components/ui/searchable-select'
import { filterCategories, type Category } from '@/features/reference/api/useCategories'

import type { SearchFilters } from '../schema/types'
import { PriceRangeFilter } from './PriceRangeFilter'

/**
 * "All categories" is a real option rather than a cleared control, so a shopper who
 * narrowed by category has an obvious way back out. It carries a sentinel slug
 * because the selector's value is a category slug and "" would read as no selection.
 */
const ALL_CATEGORIES: Category = { slug: '__all__', name: 'All categories' }

export function FilterSidebar({
  filters,
  categories,
  onChange,
}: {
  filters: SearchFilters
  categories: Category[]
  onChange: (patch: Partial<SearchFilters>) => void
}) {
  const options = [ALL_CATEGORIES, ...categories]
  return (
    <aside className="sticky top-16 flex h-fit w-56 shrink-0 flex-col gap-6 self-start rounded-xl border p-4">
      <h2 className="text-sm font-bold">Filter</h2>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Category</span>
        <SearchableSelect
          items={options}
          value={filters.category || ALL_CATEGORIES.slug}
          onChange={(slug) => onChange({ category: slug === ALL_CATEGORIES.slug ? '' : slug })}
          getKey={(category) => category.slug}
          getLabel={(category) => category.name}
          filter={filterCategories}
          label="Category"
          searchPlaceholder="Search categories"
          emptyMessage="No category matches that"
        />
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
