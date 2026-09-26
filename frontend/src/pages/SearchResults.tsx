import { Button } from '@/components/ui/button'
import { PaginationBar } from '@/components/ui/pagination'
import { ActiveFilterChips } from '@/features/search/components/ActiveFilterChips'
import { FilterSidebar } from '@/features/search/components/FilterSidebar'
import { ProductCardSkeleton } from '@/features/search/components/ProductCardSkeleton'
import { ProductGrid } from '@/features/search/components/ProductGrid'
import { ResultsHeader } from '@/features/search/components/ResultsHeader'
import { useSearchFilters } from '@/features/search/hooks/useSearchFilters'
import { useCategories } from '@/features/reference/api/useCategories'
import { useSearchProducts } from '@/features/search/api/useSearchProducts'
import { apiErrorMessage } from '@/lib/api/transient'

export function SearchResults() {
  const { filters, update, setPage, removeFilter, clearAll } = useSearchFilters()
  const query = useSearchProducts(filters)
  // The same cached system list the header and the landing rail read.
  const categoryOptions = useCategories()

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-1 gap-6 px-7 py-6">
      <FilterSidebar
        filters={filters}
        categories={categoryOptions.data ?? []}
        onChange={update}
      />

      <main className="flex flex-1 flex-col gap-4">
        <ResultsHeader
          q={filters.q}
          page={filters.page}
          totalElements={query.data?.totalElements ?? 0}
          resultCount={query.data?.content.length ?? 0}
          sort={filters.sort}
          onSortChange={(sort) => update({ sort })}
        />

        <ActiveFilterChips
          filters={filters}
          categories={categoryOptions.data ?? []}
          onRemove={removeFilter}
          onClearAll={clearAll}
        />

        {query.isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        )}

        {query.isError && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-medium">Couldn't load products</p>
            <p className="text-sm text-muted-foreground">
              {apiErrorMessage(query.error)}
            </p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {query.isSuccess && query.data.content.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-medium">No products found</p>
            <p className="text-sm text-muted-foreground">
              Try a different search term or clear your filters.
            </p>
            <Button variant="outline" onClick={clearAll}>
              Clear all filters
            </Button>
          </div>
        )}

        {query.isSuccess && query.data.content.length > 0 && (
          <>
            <ProductGrid products={query.data.content} />
            {/* No range label or Per page here: the header above the grid
                already prints the range, and this list's size is fixed. */}
            {query.data.totalPages > 1 && (
              <PaginationBar
                className="pt-4"
                page={filters.page}
                totalPages={query.data.totalPages}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
