import { AppHeader } from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import { ActiveFilterChips } from '@/features/search/components/ActiveFilterChips'
import { FilterSidebar } from '@/features/search/components/FilterSidebar'
import { ProductCardSkeleton } from '@/features/search/components/ProductCardSkeleton'
import { ProductGrid } from '@/features/search/components/ProductGrid'
import { ResultsHeader } from '@/features/search/components/ResultsHeader'
import { useSearchFilters } from '@/features/search/hooks/useSearchFilters'
import { useCategoryOptions, useSearchProducts } from '@/features/search/api/useSearchProducts'

export function SearchResults() {
  const { filters, update, setPage, removeFilter, clearAll } = useSearchFilters()
  const query = useSearchProducts(filters)
  const categoryOptions = useCategoryOptions()

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader q={filters.q} onSearch={(q) => update({ q })} />

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

          <ActiveFilterChips filters={filters} onRemove={removeFilter} onClearAll={clearAll} />

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
                {query.error?.detail ?? 'Something went wrong. Try again.'}
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
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page === 0}
                  onClick={() => setPage(filters.page - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {filters.page + 1} of {query.data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page + 1 >= query.data.totalPages}
                  onClick={() => setPage(filters.page + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
