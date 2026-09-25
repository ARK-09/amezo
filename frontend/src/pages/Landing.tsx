import { useMemo } from 'react'
import { Navigate, useSearchParams } from 'react-router'

import { useHomeRail } from '@/features/home/api/useHomeRail'
import { CategoryStrip } from '@/features/home/components/CategoryStrip'
import { HomeHero } from '@/features/home/components/HomeHero'
import { ProductRail } from '@/features/home/components/ProductRail'
import { SellerCta } from '@/features/home/components/SellerCta'
import { ValueProps } from '@/features/home/components/ValueProps'
import { useCategoryOptions } from '@/features/search/api/useSearchProducts'

const RAIL_SIZE = 8

export function Landing() {
  const [searchParams] = useSearchParams()
  const categories = useCategoryOptions()
  const trending = useHomeRail({ sort: 'relevance', size: RAIL_SIZE, inStockOnly: true })
  const newest = useHomeRail({ sort: 'newest', size: RAIL_SIZE })

  const trendingProducts = trending.data?.content
  // The hero spotlight is the best-rated thing we can actually ship today,
  // picked from the trending rail so it costs no extra request.
  const spotlight = useMemo(() => {
    if (!trendingProducts || trendingProducts.length === 0) return undefined
    const rated = trendingProducts.filter((p) => p.inStock && p.avgRating != null)
    if (rated.length === 0) return trendingProducts[0]
    return rated.reduce((best, p) => ((p.avgRating ?? 0) > (best.avgRating ?? 0) ? p : best))
  }, [trendingProducts])

  // "/" used to be the search page itself, so older links and bookmarks still
  // arrive here carrying q/category/sort - hand them on to /search rather than
  // silently dropping the query.
  const legacyQuery = searchParams.toString()
  if (legacyQuery) {
    return <Navigate to={`/search?${legacyQuery}`} replace />
  }

  return (
    <>
      <HomeHero spotlight={spotlight} />

      <CategoryStrip categories={categories.data ?? []} isLoading={categories.isLoading} />

      <ProductRail
        title="Trending this week"
        description="What buyers are adding to their carts right now."
        viewAllTo="/search"
        viewAllLabel="Browse all"
        products={trending.data?.content ?? []}
        isLoading={trending.isLoading}
        isError={trending.isError}
        onRetry={() => trending.refetch()}
      />

      <ProductRail
        title="New arrivals"
        description="The latest listings across every category."
        viewAllTo="/search?sort=newest"
        viewAllLabel="See what's new"
        products={newest.data?.content ?? []}
        isLoading={newest.isLoading}
        isError={newest.isError}
        onRetry={() => newest.refetch()}
      />

      <ValueProps />

      <SellerCta />
    </>
  )
}
