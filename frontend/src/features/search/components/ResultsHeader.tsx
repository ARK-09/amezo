import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { PAGE_SIZE, SORT_OPTIONS } from '../schema/types'
import type { SortOption } from '../schema/types'

export function ResultsHeader({
  q,
  page,
  totalElements,
  resultCount,
  sort,
  onSortChange,
}: {
  q: string
  page: number
  totalElements: number
  resultCount: number
  sort: SortOption
  onSortChange: (sort: SortOption) => void
}) {
  const start = totalElements === 0 ? 0 : page * PAGE_SIZE + 1
  const end = page * PAGE_SIZE + resultCount

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {q ? (
          <>
            {start} - {end} over {totalElements} results for &ldquo;{q}&rdquo;
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
