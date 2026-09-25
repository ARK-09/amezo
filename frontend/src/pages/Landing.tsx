import { Navigate, useSearchParams } from 'react-router'

import { useHomeRail } from '@/features/home/api/useHomeRail'
import { CategoryRail } from '@/features/home/components/CategoryRail'
import { DealRail } from '@/features/home/components/DealRail'
import { PromoHero } from '@/features/home/components/PromoHero'
import { PromoTiles } from '@/features/home/components/PromoTiles'
import { SearchBanner } from '@/features/home/components/SearchBanner'
import { useCategoryOptions } from '@/features/search/api/useSearchProducts'

const RAIL_SIZE = 6

export function Landing() {
  const [searchParams] = useSearchParams()
  const categories = useCategoryOptions()
  const categoryList = categories.data ?? []

  const deals = useHomeRail({ sort: 'relevance', size: RAIL_SIZE, inStockOnly: true })
  const fresh = useHomeRail({ sort: 'newest', size: RAIL_SIZE })
  // The design runs two category rails ("Top deals in electronics", "Best
  // sellers in beauty & health"). Which categories those are is the catalog's
  // business, not a hard-coded pair, so they follow whatever it returns.
  const [firstCategory, secondCategory] = categoryList
  const categoryOne = useHomeRail(
    { sort: 'relevance', size: RAIL_SIZE, category: firstCategory },
    { enabled: Boolean(firstCategory) },
  )
  const categoryTwo = useHomeRail(
    { sort: 'relevance', size: RAIL_SIZE, category: secondCategory },
    { enabled: Boolean(secondCategory) },
  )

  // "/" used to be the search page itself, so older links and bookmarks still
  // arrive here carrying q/category/sort - hand them on to /search rather than
  // silently dropping the query.
  const legacyQuery = searchParams.toString()
  if (legacyQuery) {
    return <Navigate to={`/search?${legacyQuery}`} replace />
  }

  const heroProducts = deals.data?.content ?? []

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-12 px-7 pt-6 pb-14">
      {/* The design leads straight into the hero banner, so the page would
          otherwise ship with no h1 at all - every heading on it is a section
          h2. This names the page for screen readers and search engines
          without changing the layout. */}
      <h1 className="sr-only">Amezo — shop thousands of products from independent sellers</h1>

      <PromoHero products={heroProducts} sideCategory={secondCategory ?? firstCategory} />

      <CategoryRail categories={categoryList} isLoading={categories.isLoading} />

      <DealRail
        id="rail-deals"
        title="Today's best picks for you"
        viewAllTo="/search?inStockOnly=true"
        products={deals.data?.content ?? []}
        isLoading={deals.isLoading}
        isError={deals.isError}
        onRetry={() => deals.refetch()}
      />

      <PromoTiles category={firstCategory} brand={heroProducts[0]?.brandName} />

      <DealRail
        id="rail-fresh"
        title="New this week"
        viewAllTo="/search?sort=newest"
        products={fresh.data?.content ?? []}
        isLoading={fresh.isLoading}
        isError={fresh.isError}
        onRetry={() => fresh.refetch()}
      />

      <SearchBanner products={heroProducts} />

      {firstCategory && (
        <DealRail
          id="rail-category-one"
          title={`Top picks in ${firstCategory}`}
          viewAllTo={`/search?category=${encodeURIComponent(firstCategory)}`}
          products={categoryOne.data?.content ?? []}
          isLoading={categoryOne.isLoading}
          isError={categoryOne.isError}
          onRetry={() => categoryOne.refetch()}
        />
      )}

      {secondCategory && (
        <DealRail
          id="rail-category-two"
          title={`Best sellers in ${secondCategory}`}
          viewAllTo={`/search?category=${encodeURIComponent(secondCategory)}`}
          products={categoryTwo.data?.content ?? []}
          isLoading={categoryTwo.isLoading}
          isError={categoryTwo.isError}
          onRetry={() => categoryTwo.refetch()}
        />
      )}
    </div>
  )
}
