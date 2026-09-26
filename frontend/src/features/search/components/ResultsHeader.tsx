import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { SORT_OPTIONS } from '../schema/types'
import type { SortOption } from '../schema/types'

/**
 * The total and the sort. The shown range belongs to the pager below the grid,
 * which owns the page size and so is the only one that can count it - this
 * header's own arithmetic printed "1585 - 1584 over 42" for a typed ?page=99.
 */
export function ResultsHeader({
  q,
  totalElements,
  sort,
  onSortChange,
}: {
  q: string
  totalElements: number
  sort: SortOption
  onSortChange: (sort: SortOption) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {q ? (
          <>
            {totalElements} results for &ldquo;{q}&rdquo;
          </>
        ) : (
          <>{totalElements} products</>
        )}
      </p>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Sort by:</span>
        <Select value={sort} onValueChange={(v) => onSortChange(v as SortOption)}>
          <SelectTrigger aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
