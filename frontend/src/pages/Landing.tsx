import { useMemo } from 'react'
import { Navigate, useSearchParams } from 'react-router'

import { useHomeRail } from '@/features/home/api/useHomeRail'
import { CategoryRail } from '@/features/home/components/CategoryRail'
import { DealRail } from '@/features/home/components/DealRail'
import { PromoHero } from '@/features/home/components/PromoHero'
import { PromoTiles } from '@/features/home/components/PromoTiles'
import { SearchBanner } from '@/features/home/components/SearchBanner'
import { useCategories, type Category } from '@/features/reference/api/useCategories'

const RAIL_SIZE = 6

/**
 * A stable empty list for before the categories load. `?? []` would mint a new array
 * every render, which defeats the memo below and hands CategoryRail a changed prop on
 * every pass.
 */
const NO_CATEGORIES: Category[] = []

export function Landing() {
  const [searchParams] = useSearchParams()
  // The system list, not a guess derived from whatever products came back. The rail
  // now shows every category the marketplace has, in its own merchandising order.
  const categories = useCategories()
  const categoryList = categories.data ?? NO_CATEGORIES

  const deals = useHomeRail({ sort: 'relevance', size: RAIL_SIZE, inStockOnly: true })
  const fresh = useHomeRail({ sort: 'newest', size: RAIL_SIZE })

  /**
   * The design runs two category rails ("Top picks in Electronics", "Best sellers in
   * Footwear"). Which two is the catalog's business, not a hard-coded pair - and it
   * has to be two categories that actually have stock, or the rail renders a heading
   * over nothing and is dropped.
   *
   * So they are taken from the products this page has already loaded, in the system
   * list's merchandising order, rather than from the head of the system list (which
   * can be a category nobody has listed in yet) or from a request of their own.
   */
  const [firstCategory, secondCategory] = useMemo(() => {
    const stocked = new Map(
      [...(deals.data?.content ?? []), ...(fresh.data?.content ?? [])].map((product) => [
        product.category.slug,
        product.category,
      ]),
    )
    const ordered = categoryList.filter((category) => stocked.has(category.slug))
    // Nothing loaded yet (or no overlap): fall back to the list's own order so the
    // rails still have something to be about once the products arrive.
    return ordered.length > 0 ? ordered : categoryList
  }, [categoryList, deals.data, fresh.data])
  const categoryOne = useHomeRail(
    { sort: 'relevance', size: RAIL_SIZE, category: firstCategory?.slug },
    { enabled: Boolean(firstCategory) },
  )
  const categoryTwo = useHomeRail(
    { sort: 'relevance', size: RAIL_SIZE, category: secondCategory?.slug },
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
        error={deals.error}
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
        error={fresh.error}
        onRetry={() => fresh.refetch()}
      />

      <SearchBanner products={heroProducts} />

      {firstCategory && (
        <DealRail
          id="rail-category-one"
          title={`Top picks in ${firstCategory.name}`}
          viewAllTo={`/search?category=${encodeURIComponent(firstCategory.slug)}`}
          products={categoryOne.data?.content ?? []}
          isLoading={categoryOne.isLoading}
          isError={categoryOne.isError}
        error={categoryOne.error}
          onRetry={() => categoryOne.refetch()}
        />
      )}

      {secondCategory && (
        <DealRail
          id="rail-category-two"
          title={`Best sellers in ${secondCategory.name}`}
          viewAllTo={`/search?category=${encodeURIComponent(secondCategory.slug)}`}
          products={categoryTwo.data?.content ?? []}
          isLoading={categoryTwo.isLoading}
          isError={categoryTwo.isError}
        error={categoryTwo.error}
          onRetry={() => categoryTwo.refetch()}
        />
      )}
    </div>
  )
}
