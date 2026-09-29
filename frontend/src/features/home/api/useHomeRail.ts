import { useQuery } from '@tanstack/react-query'

import type { SortOption } from '@/features/search/schema/types'
import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

type ProductSummaryPage = components['schemas']['ProductSummaryPage']

export interface HomeRailParams {
  sort: SortOption
  size: number
  category?: string
  inStockOnly?: boolean
}

export const homeKeys = {
  all: ['home'] as const,
  rail: (params: HomeRailParams) => [...homeKeys.all, 'rail', params] as const,
  bestSelling: (params: BestSellingParams) => [...homeKeys.all, 'best-selling', params] as const,
  newArrivals: (params: NewArrivalsParams) => [...homeKeys.all, 'new', params] as const,
}

/**
 * A plain page of the catalogue, filtered and sorted the way the search page would.
 *
 * This is the right hook for a rail that is a BROWSE - "everything in stock", "more
 * in Kitchen". It is the wrong one for a rail whose heading makes a claim about
 * popularity or recency: /products cannot rank by sales at all, and its `newest`
 * sort has no lower bound on date, so both of those claims used to come out true
 * only by accident. Those rails have their own endpoints below.
 *
 * Cached long enough that bouncing between the landing page and a product doesn't
 * refetch the whole front page every time.
 */
export function useHomeRail(params: HomeRailParams, options: { enabled?: boolean } = {}) {
  return useQuery<ProductSummaryPage, ProblemDetail>({
    enabled: options.enabled ?? true,
    queryKey: homeKeys.rail(params),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products', {
        signal,
        params: {
          query: {
            sort: params.sort,
            page: 0,
            size: params.size,
            category: params.category || undefined,
            inStockOnly: params.inStockOnly || undefined,
          },
        },
      })
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface BestSellingParams {
  size: number
  /** One category, by slug. Omitted ranks the whole catalogue. */
  category?: string
  /** Only count sales this recent. Omitted counts all of history. */
  withinDays?: number
}

/**
 * Products ranked by units actually sold.
 *
 * The ranking is computed in the orders feature and re-imposed over the listings
 * catalog will show, so a product that sold well and has since been unpublished
 * ranks high there and does not appear here. An empty page is a real answer for a
 * marketplace with no orders yet, and the rail drops itself rather than quietly
 * showing the newest listings under a "best sellers" heading - which is exactly
 * what this page used to do.
 */
export function useBestSellingRail(
  params: BestSellingParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery<ProductSummaryPage, ProblemDetail>({
    enabled: options.enabled ?? true,
    queryKey: homeKeys.bestSelling(params),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products/best-selling', {
        signal,
        params: {
          query: {
            size: params.size,
            category: params.category || undefined,
            withinDays: params.withinDays,
          },
        },
      })
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface NewArrivalsParams {
  size: number
  /** The window the rail's heading claims. Seven days for "New this week". */
  withinDays: number
}

/** Listings created inside a real window, newest first - see the endpoint's note. */
export function useNewArrivalsRail(params: NewArrivalsParams, options: { enabled?: boolean } = {}) {
  return useQuery<ProductSummaryPage, ProblemDetail>({
    enabled: options.enabled ?? true,
    queryKey: homeKeys.newArrivals(params),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products/new', {
        signal,
        params: { query: { size: params.size, withinDays: params.withinDays } },
      })
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
